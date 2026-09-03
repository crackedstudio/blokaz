import { Router } from 'express'
import { supabase } from '../db/supabase.js'
import { syncLimiter } from '../middleware/rateLimits.js'

const router = Router()

function requireDb(res) {
  if (!supabase) {
    res.status(503).json({ error: 'Session persistence not configured' })
    return false
  }
  return true
}

function validateAddress(address) {
  return typeof address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(address)
}

function validateSeed(seed) {
  return seed != null && String(seed).length > 0 && String(seed).length < 100
}

function validateTournamentId(tid) {
  return tid != null && String(tid).length > 0 && String(tid).length < 50
}

/**
 * POST /tournament-session/start
 * Creates a new tournament session row. Abandons any previous active session
 * for this (address, tournament_id) pair so only one game is active at a time.
 */
router.post('/start', async (req, res) => {
  if (!requireDb(res)) return
  const { address, tournamentId, seed, onChainGameId, onChainSeed } = req.body

  if (!validateAddress(address)) return res.status(400).json({ error: 'Invalid address' })
  if (!validateTournamentId(tournamentId)) return res.status(400).json({ error: 'Invalid tournamentId' })
  if (!validateSeed(seed)) return res.status(400).json({ error: 'Invalid seed' })

  const addr = address.toLowerCase()
  const tid  = String(tournamentId)

  // Abandon any stale active session for this player+tournament
  await supabase
    .from('tournament_sessions')
    .update({ status: 'abandoned' })
    .eq('address', addr)
    .eq('tournament_id', tid)
    .eq('status', 'active')

  const { data, error } = await supabase
    .from('tournament_sessions')
    .insert({
      address:           addr,
      tournament_id:     tid,
      seed:              String(seed),
      on_chain_game_id:  onChainGameId ? String(onChainGameId) : null,
      on_chain_seed:     onChainSeed ?? null,
      move_history:      [],
      score:             0,
      score_boost_active: false,
      is_game_over:      false,
      revive_count:      0,
      status:            'active',
    })
    .select('id')
    .single()

  if (error) {
    console.error('tournament-session/start error:', error)
    return res.status(500).json({ error: 'Failed to start tournament session' })
  }

  res.json({ sessionId: data.id })
})

/**
 * POST /tournament-session/sync
 * Hot path — called after every debounced move batch.
 * Delta sync preferred; falls back to full-history replace.
 * Rate-limited to 60 req/min per IP.
 */
router.post('/sync', syncLimiter, async (req, res) => {
  if (!requireDb(res)) return
  const {
    address, tournamentId, seed,
    newMoves, fromIndex,   // delta sync (preferred)
    moveHistory,           // legacy fallback
    score, scoreBoostActive, isGameOver, reviveCount,
    onChainGameId, onChainSeed,
  } = req.body

  if (!validateAddress(address)) return res.status(400).json({ error: 'Invalid address' })
  if (!validateTournamentId(tournamentId)) return res.status(400).json({ error: 'Invalid tournamentId' })
  if (!validateSeed(seed)) return res.status(400).json({ error: 'Invalid seed' })

  const isDelta  = Array.isArray(newMoves) && typeof fromIndex === 'number'
  const isLegacy = Array.isArray(moveHistory)
  if (!isDelta && !isLegacy) return res.status(400).json({ error: 'newMoves or moveHistory required' })

  const addr = address.toLowerCase()
  const tid  = String(tournamentId)

  // ── Delta path ────────────────────────────────────────────────────────────
  if (isDelta) {
    const { error } = await supabase.rpc('append_tournament_moves', {
      p_address:            addr,
      p_tournament_id:      tid,
      p_seed:               String(seed),
      p_new_moves:          newMoves,
      p_from_index:         fromIndex,
      p_score:              score ?? 0,
      p_score_boost_active: !!scoreBoostActive,
      p_is_game_over:       !!isGameOver,
      p_revive_count:       reviveCount ?? 0,
      p_on_chain_game_id:   onChainGameId ? String(onChainGameId) : null,
      p_on_chain_seed:      onChainSeed ?? null,
    })

    if (error) {
      console.error('tournament-session/sync rpc error:', error)
      return res.status(500).json({ error: 'Failed to sync tournament session' })
    }
    return res.json({ ok: true })
  }

  // ── Legacy full-history path ───────────────────────────────────────────────
  // Clamp the score so a stale or out-of-order request can never lower a
  // recorded score (the delta path clamps via GREATEST inside the RPC).
  const { data: existingRow } = await supabase
    .from('tournament_sessions')
    .select('score')
    .eq('address', addr)
    .eq('tournament_id', tid)
    .eq('seed', String(seed))
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  const patch = {
    move_history:       moveHistory,
    score:              Math.max(existingRow?.score ?? 0, score ?? 0),
    score_boost_active: !!scoreBoostActive,
    is_game_over:       !!isGameOver,
    revive_count:       reviveCount ?? 0,
    ...(onChainGameId != null && { on_chain_game_id: String(onChainGameId) }),
    ...(onChainSeed   != null && { on_chain_seed: onChainSeed }),
  }

  const { data: updated, error: updateError } = await supabase
    .from('tournament_sessions')
    .update(patch)
    .eq('address', addr)
    .eq('tournament_id', tid)
    .eq('seed', String(seed))
    .eq('status', 'active')
    .select('id')
    .limit(1)

  if (updateError) {
    console.error('tournament-session/sync update error:', updateError)
    return res.status(500).json({ error: 'Failed to sync tournament session' })
  }

  // No active session found — create one
  if (!updated || updated.length === 0) {
    const { error: insertError } = await supabase
      .from('tournament_sessions')
      .insert({ address: addr, tournament_id: tid, seed: String(seed), status: 'active', ...patch })

    if (insertError) {
      console.error('tournament-session/sync insert error:', insertError)
      return res.status(500).json({ error: 'Failed to sync tournament session' })
    }
  }

  res.json({ ok: true })
})

/**
 * GET /tournament-session/restore/:address/:tournamentId
 * Returns the latest active tournament session for this player+tournament.
 * Used to recover after a browser crash or localStorage wipe.
 */
router.get('/restore/:address/:tournamentId', async (req, res) => {
  if (!requireDb(res)) return
  const { address, tournamentId } = req.params

  if (!validateAddress(address)) return res.status(400).json({ error: 'Invalid address' })
  if (!validateTournamentId(tournamentId)) return res.status(400).json({ error: 'Invalid tournamentId' })

  const { data, error } = await supabase
    .from('tournament_sessions')
    .select('*')
    .eq('address', address.toLowerCase())
    .eq('tournament_id', String(tournamentId))
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('tournament-session/restore error:', error)
    return res.status(500).json({ error: 'Failed to restore tournament session' })
  }

  if (!data) return res.json({ session: null })

  res.json({
    session: {
      address:           data.address,
      tournamentId:      data.tournament_id,
      seed:              data.seed,
      onChainGameId:     data.on_chain_game_id,
      onChainSeed:       data.on_chain_seed,
      moveHistory:       data.move_history,
      score:             data.score,
      scoreBoostActive:  data.score_boost_active,
      isGameOver:        data.is_game_over,
      reviveCount:       data.revive_count,
      updatedAt:         data.updated_at,
    },
  })
})

/**
 * POST /tournament-session/complete
 * Marks a tournament session as submitted after successful on-chain score submission.
 */
router.post('/complete', async (req, res) => {
  if (!requireDb(res)) return
  const { address, tournamentId, seed, onChainSeed } = req.body

  if (!validateAddress(address)) return res.status(400).json({ error: 'Invalid address' })
  if (!validateTournamentId(tournamentId)) return res.status(400).json({ error: 'Invalid tournamentId' })
  if (!validateSeed(seed) && !validateSeed(onChainSeed)) {
    return res.status(400).json({ error: 'Invalid seed' })
  }

  // Same match as /session/complete: the row is keyed by the local seed while
  // the caller may only hold the on-chain one.
  const candidates = []
  if (validateSeed(seed)) candidates.push(`seed.eq.${String(seed)}`)
  if (validateSeed(onChainSeed)) candidates.push(`on_chain_seed.eq.${String(onChainSeed)}`)

  const { data, error } = await supabase
    .from('tournament_sessions')
    .update({ status: 'submitted' })
    .eq('address', address.toLowerCase())
    .eq('tournament_id', String(tournamentId))
    .eq('status', 'active')
    .or(candidates.join(','))
    .select('id')

  if (error) {
    console.error('tournament-session/complete error:', error)
    return res.status(500).json({ error: 'Failed to complete tournament session' })
  }

  const updated = data?.length ?? 0
  if (updated === 0) {
    console.warn(
      `[tournament-session] complete matched no active session (${address}, t${tournamentId})`
    )
  }

  res.json({ ok: true, updated })
})

/**
 * GET /tournament-session/leaderboard/:tournamentId
 * Returns all submitted + active sessions for a tournament, sorted by score.
 * Useful for an off-chain leaderboard view (faster than on-chain reads).
 */
router.get('/leaderboard/:tournamentId', async (req, res) => {
  if (!requireDb(res)) return
  const { tournamentId } = req.params

  if (!validateTournamentId(tournamentId)) return res.status(400).json({ error: 'Invalid tournamentId' })

  const { data, error } = await supabase
    .from('tournament_sessions')
    .select('address, score, on_chain_game_id, status, updated_at')
    .eq('tournament_id', String(tournamentId))
    .in('status', ['active', 'submitted'])
    .order('score', { ascending: false })
    .limit(100)

  if (error) {
    console.error('tournament-session/leaderboard error:', error)
    return res.status(500).json({ error: 'Failed to fetch leaderboard' })
  }

  res.json({ leaderboard: data ?? [] })
})

export default router

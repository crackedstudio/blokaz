import { Router } from 'express'
import { supabase } from '../db/supabase.js'
import { syncLimiter } from '../middleware/rateLimits.js'
import { computeStreak, recentDays, utcDay } from '../config/streak.js'

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

/**
 * POST /session/start
 * Registers a new game. Abandons any previous active session for this address.
 */
router.post('/start', async (req, res) => {
  if (!requireDb(res)) return
  const { address, seed, onChainGameId, onChainSeed } = req.body

  if (!validateAddress(address)) return res.status(400).json({ error: 'Invalid address' })
  if (!validateSeed(seed)) return res.status(400).json({ error: 'Invalid seed' })

  const addr = address.toLowerCase()

  // Abandon stale active sessions in one shot
  await supabase
    .from('game_sessions')
    .update({ status: 'abandoned' })
    .eq('address', addr)
    .eq('status', 'active')

  const { data, error } = await supabase
    .from('game_sessions')
    .insert({
      address: addr,
      seed: String(seed),
      on_chain_game_id: onChainGameId ? String(onChainGameId) : null,
      on_chain_seed: onChainSeed ?? null,
      move_history: [],
      score: 0,
      score_boost_active: false,
      is_game_over: false,
      revive_count: 0,
      status: 'active',
    })
    .select('id')
    .single()

  if (error) {
    console.error('session/start error:', error)
    return res.status(500).json({ error: 'Failed to start session' })
  }

  res.json({ sessionId: data.id })
})

/**
 * POST /session/sync
 * Hot path — called after every debounced move batch for every player.
 *
 * Delta sync (preferred): client sends { newMoves, fromIndex } — only the
 * moves since the last successful sync. The server appends them atomically
 * via the append_session_moves Postgres function which deduplicates any
 * overlap from retried requests.
 *
 * Legacy full-history sync: client sends { moveHistory } — replaces the
 * entire history. Used by the network-recovery (handleOnline) path which
 * sends fromIndex=0, letting the RPC treat it as a full resync.
 *
 * Rate-limited to 60 req/min per IP.
 */
router.post('/sync', syncLimiter, async (req, res) => {
  if (!requireDb(res)) return
  const {
    address, seed,
    newMoves, fromIndex,   // delta sync (preferred)
    moveHistory,           // legacy fallback
    score, scoreBoostActive, isGameOver, reviveCount,
    onChainGameId, onChainSeed,
  } = req.body

  if (!validateAddress(address)) return res.status(400).json({ error: 'Invalid address' })
  if (!validateSeed(seed)) return res.status(400).json({ error: 'Invalid seed' })

  const isDelta = Array.isArray(newMoves) && typeof fromIndex === 'number'
  const isLegacy = Array.isArray(moveHistory)
  if (!isDelta && !isLegacy) return res.status(400).json({ error: 'newMoves or moveHistory required' })

  const addr = address.toLowerCase()

  // ── Delta path (90 %+ of syncs) ───────────────────────────────────────────
  if (isDelta) {
    const { error } = await supabase.rpc('append_session_moves', {
      p_address:            addr,
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
      console.error('session/sync rpc error:', error)
      return res.status(500).json({ error: 'Failed to sync session' })
    }
    return res.json({ ok: true })
  }

  // ── Legacy full-history path (backward compat / safety net) ───────────────
  const patch = {
    move_history:       moveHistory,
    score:              score ?? 0,
    score_boost_active: !!scoreBoostActive,
    is_game_over:       !!isGameOver,
    revive_count:       reviveCount ?? 0,
    ...(onChainGameId != null && { on_chain_game_id: String(onChainGameId) }),
    ...(onChainSeed   != null && { on_chain_seed: onChainSeed }),
  }

  const { data: updated, error: updateError } = await supabase
    .from('game_sessions')
    .update(patch)
    .eq('address', addr)
    .eq('seed', String(seed))
    .eq('status', 'active')
    .select('id')
    .limit(1)

  if (updateError) {
    console.error('session/sync update error:', updateError)
    return res.status(500).json({ error: 'Failed to sync session' })
  }

  // No active session found — create one (handles race where /start was missed)
  if (!updated || updated.length === 0) {
    const { error: insertError } = await supabase
      .from('game_sessions')
      .insert({ address: addr, seed: String(seed), status: 'active', ...patch })

    if (insertError) {
      console.error('session/sync insert error:', insertError)
      return res.status(500).json({ error: 'Failed to sync session' })
    }
  }

  res.json({ ok: true })
})

/**
 * GET /session/restore/:address
 * Returns the latest active session for recovery after a browser crash or
 * localStorage wipe.
 */
router.get('/restore/:address', async (req, res) => {
  if (!requireDb(res)) return
  const address = req.params.address

  if (!validateAddress(address)) return res.status(400).json({ error: 'Invalid address' })

  const { data, error } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('address', address.toLowerCase())
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('session/restore error:', error)
    return res.status(500).json({ error: 'Failed to restore session' })
  }

  if (!data) return res.json({ session: null })

  res.json({
    session: {
      address:        data.address,
      seed:           data.seed,
      onChainGameId:  data.on_chain_game_id,
      onChainSeed:    data.on_chain_seed,
      moveHistory:    data.move_history,
      score:          data.score,
      scoreBoostActive: data.score_boost_active,
      isGameOver:     data.is_game_over,
      reviveCount:    data.revive_count,
      updatedAt:      data.updated_at,
    },
  })
})

/**
 * GET /session/streak/:address
 * The player's daily streak, derived from the runs they have finished.
 */
router.get('/streak/:address', async (req, res) => {
  if (!requireDb(res)) return
  const address = req.params.address

  if (!validateAddress(address)) return res.status(400).json({ error: 'Invalid address' })

  // A year is far more than any streak needs and keeps the row count bounded;
  // the RPC returns one row per DAY played, not per session.
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString()

  const { data, error } = await supabase.rpc('player_play_days', {
    p_address: address.toLowerCase(),
    p_since: since,
  })

  if (error) {
    console.error('session/streak error:', error)
    return res.status(500).json({ error: 'Failed to read streak' })
  }

  const days = (data ?? []).map((row) => (typeof row === 'string' ? row : row.play_day))
  const today = utcDay()

  res.json({
    ...computeStreak(days, today),
    // Oldest first — the strip both the lobby and the game sidebar draw.
    week: recentDays(days, today),
    today,
  })
})

/**
 * POST /session/complete
 * Marks a session as submitted after successful on-chain score submission.
 */
router.post('/complete', async (req, res) => {
  if (!requireDb(res)) return
  const { address, seed, onChainSeed } = req.body

  if (!validateAddress(address)) return res.status(400).json({ error: 'Invalid address' })
  if (!validateSeed(seed) && !validateSeed(onChainSeed)) {
    return res.status(400).json({ error: 'Invalid seed' })
  }

  // A row is keyed by the local session seed, but the client historically sent
  // the on-chain one — a value that lives in a different column, so the match
  // silently found nothing and the session stayed active. Restore then kept
  // offering an already-submitted run, which the player could resubmit.
  // Accepting either identifies the row whichever seed the caller has.
  const candidates = []
  if (validateSeed(seed)) candidates.push(`seed.eq.${String(seed)}`)
  if (validateSeed(onChainSeed)) candidates.push(`on_chain_seed.eq.${String(onChainSeed)}`)

  const { data, error } = await supabase
    .from('game_sessions')
    .update({ status: 'submitted' })
    .eq('address', address.toLowerCase())
    .eq('status', 'active')
    .or(candidates.join(','))
    .select('id')

  if (error) {
    console.error('session/complete error:', error)
    return res.status(500).json({ error: 'Failed to complete session' })
  }

  const updated = data?.length ?? 0
  // Nothing matched: either a duplicate call after the row was already
  // completed, or a seed that belongs to no active session. Worth saying out
  // loud — a session left active is one the player can be offered again.
  if (updated === 0) {
    console.warn(`[session] complete matched no active session (${address}, ${seed ?? onChainSeed})`)
  }

  res.json({ ok: true, updated })
})

export default router

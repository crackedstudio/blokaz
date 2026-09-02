import { Router } from 'express'
import { supabase } from '../db/supabase.js'
import { rewardsDb } from '../db/rewardsDb.js'
import {
  LEVELS,
  MAX_LEVEL,
  LEVEL_POWERUPS,
  CASH_MILESTONES,
  TARGET_KEYS,
  applyRollover,
  climb,
  weekStartOf,
} from '../config/levels.js'

const router = Router()

const ADMIN_ADDRESSES = new Set(
  (process.env.ADMIN_ADDRESSES ?? '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
)

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

function requireAdmin(req, res) {
  const addr = (req.headers['x-admin-address'] ?? '').toLowerCase()
  if (!addr || !ADMIN_ADDRESSES.has(addr)) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}

// ── Progress ─────────────────────────────────────────────────────────────────

/**
 * The four weekly counters, derived from the session/purchase tables. Nothing
 * the client sends can move these — only finishing a run or paying on-chain.
 */
async function readProgress(addr, weekStart) {
  const { data, error } = await supabase.rpc('level_progress', {
    p_address: addr,
    p_since: `${weekStart}T00:00:00Z`,
  })

  if (error) {
    console.error('level_progress rpc error:', error)
    return null
  }

  // The RPC returns a single row; PostgREST hands back either the row or a
  // one-element array depending on how it resolves the set-returning function.
  const row = Array.isArray(data) ? data[0] : data
  return {
    games: Number(row?.games ?? 0),
    tournaments: Number(row?.tournaments ?? 0),
    purchases: Number(row?.purchases ?? 0),
    points: Number(row?.points ?? 0),
  }
}

// ── Reward granting ──────────────────────────────────────────────────────────

/**
 * Pays out a level the first time a player clears it.
 *
 * Idempotent by construction: level_grants has a unique index on
 * (address, level), so the insert below is what decides whether anything is
 * credited. A player who drops to level 8 under the weekly demotion rule and
 * climbs back through it is paid once, not twice.
 *
 * Always returns a description of the level so the UI can celebrate the climb;
 * `firstClear` says whether anything was actually paid out.
 */
async function grantLevel(addr, level) {
  const powerups = LEVEL_POWERUPS[level] ?? {}

  // A milestone grant is written as PENDING and only cleared once the cash link
  // is actually in the player's rewards. The unique index below means this row
  // is inserted exactly once, so if the process dies between the insert and the
  // pool draw the retry returns early — leaving the entitlement stranded unless
  // it was already recorded as owed. Defaulting to pending is what makes the
  // crash recoverable: the worst case is a milestone an admin has to settle,
  // never one the player silently loses.
  const isMilestone = CASH_MILESTONES.has(level)

  const { data: grant, error } = await supabase
    .from('level_grants')
    .insert({ address: addr, level, powerups, cash_pending: isMilestone })
    .select('id')
    .single()

  // A level already in level_grants is a re-clear after a demotion: the player
  // climbs back through it and we say so, but nothing is credited again.
  const alreadyGranted = error?.code === '23505'
  if (alreadyGranted) {
    return { level, name: LEVELS[level].name, powerups: {}, cash: null, firstClear: false }
  }
  if (error) {
    console.error(`level_grants insert error (level ${level}):`, error)
    return null
  }

  // ── Power-ups: credit each column atomically ───────────────────────────────
  for (const [column, qty] of Object.entries(powerups)) {
    const { error: invError } = await supabase.rpc('increment_inventory', {
      p_address: addr,
      p_column: column,
      p_qty: qty,
    })
    if (invError) console.error(`level ${level} inventory credit error (${column}):`, invError)
  }

  // ── Cash milestone: draw one pre-funded link from the pool ─────────────────
  let cash = null
  if (isMilestone) {
    if (!rewardsDb) {
      // No client for the rewards project — do NOT draw a link we cannot
      // deliver. Leave the grant pending so an admin settles it and the
      // funded link stays in the pool.
      console.warn(`[levels] rewards project not configured — level ${level} left pending (${addr})`)
      return { level, name: LEVELS[level].name, powerups, cash: { pending: true }, firstClear: true }
    }

    const { data: pool, error: poolError } = await supabase.rpc('claim_level_cashlink', {
      p_address: addr,
      p_level: level,
    })
    const link = Array.isArray(pool) ? pool[0] : pool

    if (poolError) console.error(`claim_level_cashlink error (level ${level}):`, poolError)

    if (link?.cash_link_url) {
      // The rewards table lives in a separate Supabase project, so this write
      // goes through rewardsDb rather than the sessions client. Delivering it
      // there is what makes the existing PlayerRewardsPanel claim flow pick it
      // up unchanged.
      const { data: reward, error: rewardError } = await rewardsDb
        .from('rewards')
        .insert({
          address: addr,
          cash_link_url: link.cash_link_url,
          amount: link.amount,
          token: link.token,
          label: `Level ${level} — ${LEVELS[level].name}`,
        })
        .select('id')
        .single()

      if (rewardError) {
        // The link was marked assigned but never reached the player. Release it
        // so it goes back into circulation instead of being burned, and leave
        // the grant pending for /levels/admin/fulfil.
        console.error(`level ${level} reward insert error:`, rewardError)
        await supabase
          .from('level_cashlink_pool')
          .update({ assigned_to: null, assigned_at: null })
          .eq('id', link.id)
      } else {
        cash = { amount: link.amount, token: link.token }
        await supabase
          .from('level_grants')
          .update({ cash_reward_id: reward.id, cash_pending: false })
          .eq('id', grant.id)
      }
    } else {
      // Pool is dry. The grant stays pending, so the player keeps the
      // entitlement and an admin settles it via /levels/admin/fulfil.
      console.warn(`[levels] cash-link pool empty for level ${level} (${addr})`)
      cash = { pending: true }
    }
  }

  return { level, name: LEVELS[level].name, powerups, cash, firstClear: true }
}

// ── State assembly ───────────────────────────────────────────────────────────

/**
 * Has this player ever cleared level 12's card?
 *
 * `held` from climb() only reports the refresh that clears it — every read
 * afterwards returns false — so it cannot answer this. level_grants is the
 * durable record: one row per (address, level), written the first time a level
 * is cleared and protected by a unique index. This rides that index.
 */
async function isSovereign(addr) {
  const { data, error } = await supabase
    .from('level_grants')
    .select('level')
    .eq('address', addr)
    .eq('level', MAX_LEVEL)
    .maybeSingle()
  if (error) {
    console.error('level_grants sovereign lookup error:', error)
    return false
  }
  return !!data
}

function buildState(row, progress, extras = {}) {
  const level = row.level
  const spec = LEVELS[level]
  const targets = spec.targets

  return {
    level,
    name: spec.name,
    accent: spec.accent,
    highestLevel: row.highest_level,
    maxLevel: MAX_LEVEL,
    weekStart: row.week_start,
    levelsGainedThisWeek: row.levels_gained_this_week,
    // At level 12 there is nowhere to advance, so clearing its card is what
    // holds rank instead of gaining one.
    atRisk: row.levels_gained_this_week === 0,
    progress,
    targets,
    // Per-objective completion so the UI can tick each row without duplicating
    // the comparison logic.
    complete: Object.fromEntries(
      TARGET_KEYS.map((key) => [key, (progress[key] ?? 0) >= targets[key]])
    ),
    ...extras,
  }
}

// ── POST /levels/refresh ─────────────────────────────────────────────────────

/**
 * The authoritative endpoint: applies any pending weekly rollover, advances the
 * player as far as their weekly progress allows, pays out newly cleared levels,
 * and returns the resulting state.
 *
 * Called on lobby mount and after anything that can move a counter (game over,
 * tournament run, shop purchase).
 */
router.post('/refresh', async (req, res) => {
  if (!requireDb(res)) return
  const { address } = req.body

  if (!validateAddress(address)) return res.status(400).json({ error: 'Invalid address' })

  const addr = address.toLowerCase()
  const currentWeek = weekStartOf()

  // ── Load or create the player's ladder row ──────────────────────────────────
  let { data: row, error: readError } = await supabase
    .from('player_levels')
    .select('*')
    .eq('address', addr)
    .single()

  if (readError && readError.code !== 'PGRST116') {
    console.error('levels/refresh read error:', readError)
    return res.status(500).json({ error: 'Failed to read level' })
  }

  if (!row) {
    const { data: created, error: createError } = await supabase
      .from('player_levels')
      .insert({ address: addr, level: 1, highest_level: 1, week_start: currentWeek })
      .select('*')
      .single()

    if (createError) {
      // Another concurrent refresh created it first — read it back.
      const { data: existing } = await supabase
        .from('player_levels')
        .select('*')
        .eq('address', addr)
        .single()
      if (!existing) {
        console.error('levels/refresh create error:', createError)
        return res.status(500).json({ error: 'Failed to create level' })
      }
      row = existing
    } else {
      row = created
    }
  }

  const levelBefore = row.level

  // ── Weekly rollover ─────────────────────────────────────────────────────────
  const rolled = applyRollover(row, currentWeek)
  row.level = rolled.level
  row.week_start = rolled.weekStart
  row.levels_gained_this_week = rolled.levelsGained
  const demotedBy = rolled.demotedBy

  // ── Derive this week's progress ─────────────────────────────────────────────
  const progress = await readProgress(addr, currentWeek)
  if (!progress) return res.status(500).json({ error: 'Failed to read progress' })

  // ── Climb as far as this week's progress allows ─────────────────────────────
  const ascent = climb(row.level, progress)

  const advanced = []
  for (const level of ascent.cleared) {
    const granted = await grantLevel(addr, level)
    if (granted) advanced.push(granted)
  }

  const gained = ascent.level - row.level
  row.level = ascent.level
  row.levels_gained_this_week += gained

  // Level 12 has nowhere to climb, so clearing its card holds the rank rather
  // than gaining one — otherwise a maxed player would be demoted every Monday.
  if (ascent.held && row.levels_gained_this_week === 0) row.levels_gained_this_week = 1

  row.highest_level = Math.max(row.highest_level, row.level)

  // ── Persist ─────────────────────────────────────────────────────────────────
  const changed =
    row.level !== levelBefore || demotedBy > 0 || advanced.length > 0 || ascent.held

  if (changed || row.week_start !== currentWeek) {
    // Guarded on the level we started from so two concurrent refreshes can't
    // both apply the same advance and double-count levels_gained_this_week.
    const { error: writeError } = await supabase
      .from('player_levels')
      .update({
        level: row.level,
        highest_level: row.highest_level,
        week_start: row.week_start,
        levels_gained_this_week: row.levels_gained_this_week,
      })
      .eq('address', addr)
      .eq('level', levelBefore)

    if (writeError) console.error('levels/refresh write error:', writeError)
  }

  res.json({
    state: buildState(row, progress, {
      advanced,
      demotedBy,
      held: ascent.held,
      maxed: row.level === MAX_LEVEL,
      // Durable, unlike `held` — this is what the client latches SilverGod on.
      sovereign: await isSovereign(addr),
    }),
  })
})

// ── Admin ────────────────────────────────────────────────────────────────────

/**
 * POST /levels/admin/pool
 * Loads pre-funded cash links for a milestone level.
 * Body: { level, links: [{ cashLinkUrl, amount, token }] }
 */
router.post('/admin/pool', async (req, res) => {
  if (!requireDb(res)) return
  if (!requireAdmin(req, res)) return

  const { level, links } = req.body

  if (!CASH_MILESTONES.has(Number(level))) {
    return res.status(400).json({ error: `level must be one of ${[...CASH_MILESTONES].join(', ')}` })
  }
  if (!Array.isArray(links) || links.length === 0) {
    return res.status(400).json({ error: 'links[] required' })
  }
  if (links.some((l) => !l?.cashLinkUrl || !l?.amount)) {
    return res.status(400).json({ error: 'each link needs cashLinkUrl and amount' })
  }

  const { data, error } = await supabase
    .from('level_cashlink_pool')
    .insert(
      links.map((l) => ({
        level: Number(level),
        cash_link_url: l.cashLinkUrl,
        amount: String(l.amount),
        token: l.token ?? 'USDT',
      }))
    )
    .select('id')

  if (error) {
    console.error('levels/admin/pool error:', error)
    return res.status(500).json({ error: 'Failed to load pool' })
  }

  res.json({ ok: true, added: data.length })
})

/**
 * GET /levels/admin/pending
 * Every player who has reached a cash milestone, split into those still owed a
 * payout and those already paid, plus the remaining free links per milestone
 * level so the pool can be topped up before it runs dry again.
 *
 * The `paid` list matters as much as `pending`: it is the record of who was
 * rewarded and when, so the admin portal can show the full milestone history
 * rather than only the outstanding work.
 */
router.get('/admin/pending', async (req, res) => {
  if (!requireDb(res)) return
  if (!requireAdmin(req, res)) return

  const milestoneLevels = [...CASH_MILESTONES]

  const [{ data: grants, error: grantsError }, { data: pool, error: poolError }] =
    await Promise.all([
      supabase
        .from('level_grants')
        .select('id, address, level, granted_at, cash_pending, cash_reward_id')
        .in('level', milestoneLevels)
        .order('granted_at', { ascending: false }),
      supabase.from('level_cashlink_pool').select('level').is('assigned_to', null),
    ])

  if (grantsError || poolError) {
    console.error('levels/admin/pending error:', grantsError ?? poolError)
    return res.status(500).json({ error: 'Failed to read milestones' })
  }

  const withName = (g) => ({ ...g, name: LEVELS[g.level].name })

  // Oldest first for pending — that is the queue the admin works through.
  const pending = (grants ?? [])
    .filter((g) => g.cash_pending)
    .map(withName)
    .reverse()

  const paid = (grants ?? []).filter((g) => !g.cash_pending).map(withName)

  const available = {}
  for (const level of CASH_MILESTONES) available[level] = 0
  for (const r of pool ?? []) available[r.level] = (available[r.level] ?? 0) + 1

  res.json({ pending, paid, available })
})

/**
 * POST /levels/admin/fulfil
 * Settles one pending milestone by issuing a cash link to the player.
 * Body: { grantId, cashLinkUrl, amount, token }
 */
router.post('/admin/fulfil', async (req, res) => {
  if (!requireDb(res)) return
  if (!requireAdmin(req, res)) return

  const { grantId, cashLinkUrl, amount, token } = req.body

  if (!grantId) return res.status(400).json({ error: 'grantId required' })
  if (!cashLinkUrl) return res.status(400).json({ error: 'cashLinkUrl required' })
  if (!amount) return res.status(400).json({ error: 'amount required' })

  const { data: grant, error: grantError } = await supabase
    .from('level_grants')
    .select('id, address, level, cash_pending')
    .eq('id', grantId)
    .single()

  if (grantError || !grant) return res.status(404).json({ error: 'Grant not found' })
  if (!grant.cash_pending) return res.status(409).json({ error: 'Grant is not pending' })

  if (!rewardsDb) {
    return res.status(503).json({ error: 'Rewards project not configured on the server' })
  }

  const { data: reward, error: rewardError } = await rewardsDb
    .from('rewards')
    .insert({
      address: grant.address,
      cash_link_url: cashLinkUrl,
      amount: String(amount),
      token: token ?? 'USDT',
      label: `Level ${grant.level} — ${LEVELS[grant.level].name}`,
    })
    .select('id')
    .single()

  if (rewardError) {
    console.error('levels/admin/fulfil reward error:', rewardError)
    return res.status(500).json({ error: 'Failed to issue reward' })
  }

  const { error: updateError } = await supabase
    .from('level_grants')
    .update({ cash_pending: false, cash_reward_id: reward.id })
    .eq('id', grantId)

  if (updateError) {
    console.error('levels/admin/fulfil update error:', updateError)
    return res.status(500).json({ error: 'Failed to settle grant' })
  }

  res.json({ ok: true, rewardId: reward.id })
})

// ── GET /levels/:address ─────────────────────────────────────────────────────

/**
 * Read-only snapshot — no rollover, no advancement, no payouts. Safe for
 * display surfaces (leaderboards, admin) that shouldn't mutate progression.
 */
router.get('/:address', async (req, res) => {
  if (!requireDb(res)) return
  const { address } = req.params

  if (!validateAddress(address)) return res.status(400).json({ error: 'Invalid address' })

  const addr = address.toLowerCase()

  const { data: row, error } = await supabase
    .from('player_levels')
    .select('*')
    .eq('address', addr)
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('levels/get error:', error)
    return res.status(500).json({ error: 'Failed to read level' })
  }

  if (!row) {
    // Unranked player — report the level-1 card without creating a row.
    const empty = { games: 0, tournaments: 0, purchases: 0, points: 0 }
    const fresh = {
      level: 1,
      highest_level: 1,
      week_start: weekStartOf(),
      levels_gained_this_week: 0,
    }
    // No player_levels row means they have never cleared anything.
    return res.json({
      state: buildState(fresh, empty, {
        advanced: [], demotedBy: 0, held: false, maxed: false, sovereign: false,
      }),
    })
  }

  const progress = await readProgress(addr, row.week_start)
  if (!progress) return res.status(500).json({ error: 'Failed to read progress' })

  res.json({
    state: buildState(row, progress, {
      advanced: [],
      demotedBy: 0,
      held: false,
      sovereign: await isSovereign(addr),
      maxed: row.level === MAX_LEVEL,
    }),
  })
})

export default router

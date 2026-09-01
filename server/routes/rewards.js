import { Router } from 'express'
// The rewards table lives in its own Supabase project, not the one holding
// sessions and inventory — every query here goes through that client.
import { rewardsDb } from '../db/rewardsDb.js'

const router = Router()

// Comma-separated list of admin wallet addresses in lowercase
// e.g. ADMIN_ADDRESSES=0xe1a0f916e859624d4edbada23e4382d327eaf626
const ADMIN_ADDRESSES = new Set(
  (process.env.ADMIN_ADDRESSES ?? '')
    .split(',')
    .map(a => a.trim().toLowerCase())
    .filter(Boolean)
)

function requireDb(res) {
  if (!rewardsDb) {
    res.status(503).json({ error: 'Rewards project not configured' })
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

/**
 * POST /rewards/claim
 * Marks a reward as claimed and returns the cash link URL.
 * The URL is only revealed here — never in the list endpoint.
 */
router.post('/claim', async (req, res) => {
  if (!requireDb(res)) return
  const { address, rewardId } = req.body

  if (!validateAddress(address)) return res.status(400).json({ error: 'Invalid address' })
  if (!rewardId) return res.status(400).json({ error: 'rewardId required' })

  const { data: reward, error: fetchError } = await rewardsDb
    .from('rewards')
    .select('id, address, cash_link_url, claimed_at')
    .eq('id', rewardId)
    .single()

  if (fetchError || !reward) return res.status(404).json({ error: 'Reward not found' })
  if (reward.address !== address.toLowerCase()) return res.status(403).json({ error: 'Not your reward' })

  // Already claimed — still return the URL so they can re-open if needed
  if (reward.claimed_at) {
    return res.json({ ok: true, cashLinkUrl: reward.cash_link_url, alreadyClaimed: true })
  }

  const { error: updateError } = await rewardsDb
    .from('rewards')
    .update({ claimed_at: new Date().toISOString() })
    .eq('id', rewardId)

  if (updateError) {
    console.error('rewards/claim error:', updateError)
    return res.status(500).json({ error: 'Failed to claim reward' })
  }

  res.json({ ok: true, cashLinkUrl: reward.cash_link_url })
})

/**
 * POST /rewards/admin/add
 * Admin only — add a reward for a player.
 * Requires x-admin-address header matching an address in ADMIN_ADDRESSES env var.
 */
router.post('/admin/add', async (req, res) => {
  if (!requireDb(res)) return
  if (!requireAdmin(req, res)) return

  const { address, cashLinkUrl, amount, token, label } = req.body

  if (!validateAddress(address)) return res.status(400).json({ error: 'Invalid address' })
  if (!cashLinkUrl) return res.status(400).json({ error: 'cashLinkUrl required' })
  if (!amount) return res.status(400).json({ error: 'amount required' })
  if (!label) return res.status(400).json({ error: 'label required' })

  const { data, error } = await rewardsDb
    .from('rewards')
    .insert({
      address:       address.toLowerCase(),
      cash_link_url: cashLinkUrl,
      amount:        String(amount),
      token:         token ?? 'USDT',
      label,
    })
    .select('id')
    .single()

  if (error) {
    console.error('rewards/admin/add error:', error)
    return res.status(500).json({ error: 'Failed to add reward' })
  }

  res.json({ ok: true, rewardId: data.id })
})

/**
 * GET /rewards/admin/all
 * Admin only — list all rewards across all players.
 */
router.get('/admin/all', async (req, res) => {
  if (!requireDb(res)) return
  if (!requireAdmin(req, res)) return

  const { data, error } = await rewardsDb
    .from('rewards')
    .select('id, address, label, amount, token, claimed_at, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('rewards/admin/all error:', error)
    return res.status(500).json({ error: 'Failed to fetch rewards' })
  }

  res.json({ rewards: data ?? [] })
})

/**
 * DELETE /rewards/admin/:id
 * Admin only — delete a reward. Blocked if already claimed.
 */
router.delete('/admin/:id', async (req, res) => {
  if (!requireDb(res)) return
  if (!requireAdmin(req, res)) return

  const { id } = req.params

  const { data: reward } = await rewardsDb
    .from('rewards')
    .select('claimed_at')
    .eq('id', id)
    .single()

  if (reward?.claimed_at) {
    return res.status(409).json({ error: 'Cannot delete a claimed reward' })
  }

  const { error } = await rewardsDb.from('rewards').delete().eq('id', id)

  if (error) {
    console.error('rewards/admin/delete error:', error)
    return res.status(500).json({ error: 'Failed to delete reward' })
  }

  res.json({ ok: true })
})

/**
 * GET /rewards/:address
 * Returns all rewards (claimed + unclaimed) for a player.
 * Cash link URLs are never included — only returned at claim time.
 */
router.get('/:address', async (req, res) => {
  if (!requireDb(res)) return
  const { address } = req.params

  if (!validateAddress(address)) return res.status(400).json({ error: 'Invalid address' })

  const { data, error } = await rewardsDb
    .from('rewards')
    .select('id, label, amount, token, claimed_at, created_at')
    .eq('address', address.toLowerCase())
    .order('created_at', { ascending: false })

  if (error) {
    console.error('rewards/get error:', error)
    return res.status(500).json({ error: 'Failed to fetch rewards' })
  }

  res.json({ rewards: data ?? [] })
})

export default router

import { Router } from 'express'
import { createPublicClient, http, fallback, parseEventLogs, erc20Abi } from 'viem'
import { celo } from 'viem/chains'
import { supabase } from '../db/supabase.js'

const router = Router()

const VALID_ITEM_IDS = new Set(['revivalBundle', 'scoreBoost', 'shield', 'bomb', 'rotatePass'])
// Log-only receipts: recorded in purchase_log but never credit inventory
// ('revive' = a single stablecoin revive consumed at purchase time).
const LOG_ONLY_IDS = new Set(['revive'])
const VALID_TOKENS = new Set(['USDC', 'USDT', 'USDm'])

const BUNDLE_IDS = new Set(['revivalMegaPack', 'powerPack', 'starterPack'])

// ── On-chain payment verification ─────────────────────────────────────────────

const GAME_TREASURY = (process.env.GAME_TREASURY ?? '0x3E325B45F72dFCc3875f75b5933A5da183Ec4225').toLowerCase()

const TOKENS = {
  USDC: { address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', decimals: 6 },
  USDT: { address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e', decimals: 6 },
  USDm: { address: '0x765DE816845861e75A25fCA122bb6898B8B1282a', decimals: 18 },
}

// Price of each purchasable id in US cents — must stay in sync with the shop UI
// (src/components/ShopModal.tsx) and revive cost (src/constants/contracts.ts).
const PRICE_CENTS = {
  revivalBundle: 10, scoreBoost: 10, shield: 10, bomb: 10, rotatePass: 10,
  revive: 10,
  revivalMegaPack: 25, powerPack: 20, starterPack: 35,
}

// Backup public endpoints so a flaky primary RPC can't reject legitimate
// purchase receipts (retryable 503s would still recover, but slower).
const BACKUP_RPCS = ['https://forno.celo.org', 'https://1rpc.io/celo']

const publicClient = process.env.RPC_URL
  ? createPublicClient({
      chain: celo,
      transport: fallback([
        http(process.env.RPC_URL),
        ...BACKUP_RPCS.filter((u) => u !== process.env.RPC_URL).map((u) => http(u)),
      ]),
    })
  : null

if (!publicClient) {
  console.warn('[inventory] RPC_URL not set — purchase receipts will NOT be verified on-chain')
}

/**
 * Verifies that txHash is a mined, successful transfer of at least the price of
 * `quantity` of the item, in the claimed token, from the claimed address to the
 * game treasury.
 *
 * The quantity is part of the price and always has been — it was simply not
 * charged for. The route accepts up to 100 units per call and writes that
 * number to inventory and to purchase_log, so checking a single unit's price
 * let one $0.10 transfer buy a hundred power-ups, and clear the ladder's
 * purchase objectives with it.
 *
 * Returns { ok: true } | { ok: false, retryable: boolean, error: string }.
 * retryable=true means the receipt may simply not be indexed yet — the client
 * queues and retries these, so a slow RPC never loses a legitimate receipt.
 */
async function verifyPurchaseTx(txHash, address, tokenSymbol, itemId, quantity = 1) {
  if (!publicClient) return { ok: true } // verification disabled (no RPC configured)

  const token = TOKENS[tokenSymbol]
  const priceCents = PRICE_CENTS[itemId]
  const units = BigInt(Math.max(1, Math.floor(Number(quantity) || 1)))
  const expected = (BigInt(priceCents) * units * 10n ** BigInt(token.decimals)) / 100n

  let receipt
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash })
  } catch (err) {
    const notFound = err?.name === 'TransactionReceiptNotFoundError'
    return {
      ok: false,
      retryable: true,
      error: notFound ? 'Transaction not yet indexed — retry shortly' : 'Chain verification unavailable — retry shortly',
    }
  }

  if (receipt.status !== 'success') {
    return { ok: false, retryable: false, error: 'Transaction reverted on-chain' }
  }

  const transfers = parseEventLogs({ abi: erc20Abi, logs: receipt.logs, eventName: 'Transfer' })
  const paid = transfers.some((log) =>
    log.address.toLowerCase() === token.address.toLowerCase() &&
    log.args.from.toLowerCase() === address.toLowerCase() &&
    log.args.to.toLowerCase() === GAME_TREASURY &&
    log.args.value >= expected
  )
  if (!paid) {
    return { ok: false, retryable: false, error: 'Transaction does not pay for this item' }
  }
  return { ok: true }
}

// What each bundle credits to player_inventory
const BUNDLE_CONTENTS = {
  revivalMegaPack: [{ column: 'revival_bundle', qty: 9 }],
  powerPack: [
    { column: 'score_boost', qty: 2 },
    { column: 'shield', qty: 2 },
    { column: 'bomb', qty: 2 },
  ],
  starterPack: [
    { column: 'revival_bundle', qty: 3 },
    { column: 'score_boost', qty: 1 },
    { column: 'shield', qty: 1 },
    { column: 'bomb', qty: 1 },
    { column: 'rotate_pass', qty: 1 },
  ],
}

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

/**
 * GET /inventory/:address
 * Returns the server-side inventory + free tries for a player.
 * Called on game load so players recover items after a localStorage wipe.
 */
router.get('/:address', async (req, res) => {
  if (!requireDb(res)) return
  const address = req.params.address

  if (!validateAddress(address)) return res.status(400).json({ error: 'Invalid address' })

  const { data, error } = await supabase
    .from('player_inventory')
    .select('*')
    .eq('address', address.toLowerCase())
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('inventory/get error:', error)
    return res.status(500).json({ error: 'Failed to fetch inventory' })
  }

  if (!data) return res.json({ inventory: null })

  res.json({
    inventory: {
      revivalBundle: data.revival_bundle,
      scoreBoost: data.score_boost,
      shield: data.shield,
      bomb: data.bomb,
      rotatePass: data.rotate_pass,
    },
    freeTries: {
      scoreBoost: data.free_score_boost,
      shield: data.free_shield,
      bomb: data.free_bomb,
      rotatePass: data.free_rotate_pass,
    },
  })
})

/**
 * POST /inventory/sync
 * Syncs the client's current inventory + free tries to the server.
 * Called whenever inventory changes (purchase, use, load).
 *
 * Body: { address, inventory: { revivalBundle, scoreBoost, shield, bomb, rotatePass },
 *         freeTries: { scoreBoost, shield, bomb, rotatePass } }
 */
router.post('/sync', async (req, res) => {
  if (!requireDb(res)) return
  const { address, inventory, freeTries } = req.body

  if (!validateAddress(address)) return res.status(400).json({ error: 'Invalid address' })
  if (!inventory || !freeTries) return res.status(400).json({ error: 'inventory and freeTries required' })

  const { error } = await supabase
    .from('player_inventory')
    .upsert(
      {
        address: address.toLowerCase(),
        revival_bundle: Math.max(0, inventory.revivalBundle ?? 0),
        score_boost: Math.max(0, inventory.scoreBoost ?? 0),
        shield: Math.max(0, inventory.shield ?? 0),
        bomb: Math.max(0, inventory.bomb ?? 0),
        rotate_pass: Math.max(0, inventory.rotatePass ?? 0),
        free_score_boost: Math.max(0, freeTries.scoreBoost ?? 0),
        free_shield: Math.max(0, freeTries.shield ?? 0),
        free_bomb: Math.max(0, freeTries.bomb ?? 0),
        free_rotate_pass: Math.max(0, freeTries.rotatePass ?? 0),
      },
      { onConflict: 'address' }
    )

  if (error) {
    console.error('inventory/sync error:', error)
    return res.status(500).json({ error: 'Failed to sync inventory' })
  }

  res.json({ ok: true })
})

/**
 * POST /inventory/purchase
 * Records a confirmed on-chain purchase and credits inventory server-side.
 * Called after waitForTransactionReceipt resolves successfully.
 *
 * Body: { address, itemId, quantity, tokenSymbol, txHash }
 */
router.post('/purchase', async (req, res) => {
  if (!requireDb(res)) return
  const { address, itemId, quantity, tokenSymbol, txHash } = req.body

  if (!validateAddress(address)) return res.status(400).json({ error: 'Invalid address' })
  if (!VALID_ITEM_IDS.has(itemId) && !BUNDLE_IDS.has(itemId) && !LOG_ONLY_IDS.has(itemId)) {
    return res.status(400).json({ error: 'Invalid itemId' })
  }
  if (!VALID_TOKENS.has(tokenSymbol)) return res.status(400).json({ error: 'Invalid tokenSymbol' })
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    return res.status(400).json({ error: 'Invalid quantity' })
  }
  if (typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return res.status(400).json({ error: 'Invalid txHash' })
  }

  const addr = address.toLowerCase()

  // Prevent duplicate processing of the same tx
  {
    const { data: existing } = await supabase
      .from('purchase_log')
      .select('id')
      .eq('tx_hash', txHash)
      .limit(1)
      .single()

    if (existing) {
      return res.status(409).json({ error: 'Transaction already processed' })
    }
  }

  // Verify the payment actually happened on-chain before crediting anything —
  // a fabricated txHash must never mint free power-ups.
  // Bundles are a single fixed-price purchase whatever they contain; every
  // other item is priced per unit.
  const paidUnits = BUNDLE_IDS.has(itemId) ? 1 : quantity
  const verification = await verifyPurchaseTx(txHash, addr, tokenSymbol, itemId, paidUnits)
  if (!verification.ok) {
    console.warn(`[inventory] purchase verification failed (${itemId}, ${txHash}): ${verification.error}`)
    return res.status(verification.retryable ? 503 : 400).json({ error: verification.error })
  }

  // ── Log-only receipt (consumed single revive): record, no inventory credit ──
  if (LOG_ONLY_IDS.has(itemId)) {
    const { error } = await supabase.from('purchase_log').insert({
      address: addr, item_id: itemId, quantity,
      token_symbol: tokenSymbol, tx_hash: txHash,
    })
    if (error) {
      console.error('purchase_log revive insert error:', error)
      return res.status(500).json({ error: 'Failed to record purchase' })
    }
    return res.json({ ok: true })
  }

  // ── Bundle purchase: credit each component item ─────────────────────────────
  if (BUNDLE_IDS.has(itemId)) {
    const contents = BUNDLE_CONTENTS[itemId]
    const logResult = await supabase.from('purchase_log').insert({
      address: addr, item_id: itemId, quantity: 1,
      token_symbol: tokenSymbol, tx_hash: txHash ?? null,
    })
    if (logResult.error) console.error('purchase_log bundle insert error:', logResult.error)

    for (const { column, qty } of contents) {
      const r = await supabase.rpc('increment_inventory', { p_address: addr, p_column: column, p_qty: qty })
      if (r.error?.code === 'PGRST202') {
        const { data } = await supabase.from('player_inventory').select(column).eq('address', addr).single()
        await supabase.from('player_inventory').upsert(
          { address: addr, [column]: (data?.[column] ?? 0) + qty },
          { onConflict: 'address' }
        )
      } else if (r.error) {
        console.error(`bundle inventory credit error (${column}):`, r.error)
        return res.status(500).json({ error: 'Failed to credit bundle inventory' })
      }
    }
    return res.json({ ok: true })
  }

  // ── Single item purchase ─────────────────────────────────────────────────────
  const columnMap = {
    revivalBundle: 'revival_bundle',
    scoreBoost: 'score_boost',
    shield: 'shield',
    bomb: 'bomb',
    rotatePass: 'rotate_pass',
  }
  const column = columnMap[itemId]

  const [logResult, invResult] = await Promise.all([
    supabase.from('purchase_log').insert({
      address: addr,
      item_id: itemId,
      quantity,
      token_symbol: tokenSymbol,
      tx_hash: txHash ?? null,
    }),
    supabase.rpc('increment_inventory', {
      p_address: addr,
      p_column: column,
      p_qty: quantity,
    }).then(r => {
      if (r.error?.code === 'PGRST202') {
        return supabase
          .from('player_inventory')
          .select(column)
          .eq('address', addr)
          .single()
          .then(({ data }) => {
            const current = data?.[column] ?? 0
            return supabase
              .from('player_inventory')
              .upsert({ address: addr, [column]: current + quantity }, { onConflict: 'address' })
          })
      }
      return r
    }),
  ])

  if (logResult.error) console.error('purchase_log insert error:', logResult.error)
  if (invResult.error) {
    console.error('inventory credit error:', invResult.error)
    return res.status(500).json({ error: 'Failed to credit inventory' })
  }

  res.json({ ok: true })
})

/**
 * GET /inventory/purchases/:address
 * Returns the full purchase history for an address.
 * Useful for dispute resolution and player-facing receipts.
 */
router.get('/purchases/:address', async (req, res) => {
  if (!requireDb(res)) return
  const address = req.params.address

  if (!validateAddress(address)) return res.status(400).json({ error: 'Invalid address' })

  const { data, error } = await supabase
    .from('purchase_log')
    .select('item_id, quantity, token_symbol, tx_hash, created_at')
    .eq('address', address.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('purchases/get error:', error)
    return res.status(500).json({ error: 'Failed to fetch purchases' })
  }

  res.json({ purchases: data ?? [] })
})

export default router

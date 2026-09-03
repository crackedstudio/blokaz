import React, { useState } from 'react'
import {
  useLevelMilestones,
  fulfilMilestone,
  loadMilestonePool,
  type MilestoneGrant,
} from '../hooks/useLevelMilestones'

// Mirrors poolLevels() on the server. Level 1 is the TEST-ONLY milestone: its
// pool is drawn only by the addresses whitelisted in server/config/levels.js,
// so links loaded here reach the tester and nobody else. Drop the 1 when the
// whitelist there is removed.
const MILESTONE_LEVELS = [1, 4, 8, 12]

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── A player owed a payout ───────────────────────────────────────────────────

const PendingRow: React.FC<{
  grant: MilestoneGrant
  adminAddress: string
  onSettled: () => void
}> = ({ grant, adminAddress, onSettled }) => {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [amount, setAmount] = useState('')
  const [token, setToken] = useState('USDT')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!url.trim() || !amount.trim()) {
      setError('Cash link and amount are both required.')
      return
    }
    setBusy(true)
    setError(null)
    const result = await fulfilMilestone(
      adminAddress,
      grant.id,
      url.trim(),
      amount.trim(),
      token
    )
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? 'Failed to issue the reward.')
      return
    }
    setOpen(false)
    setUrl('')
    setAmount('')
    onSettled()
  }

  return (
    <div className="border-[3px] border-ink bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-[13px]">
            LVL {grant.level} · {grant.name}
          </div>
          <div className="mt-0.5 font-body text-[12px] text-ink/60">
            <span className="select-all">{grant.address}</span> · reached{' '}
            {when(grant.granted_at)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="brutal-btn shrink-0 px-4 py-2 font-display text-[11px] tracking-[0.12em]"
        >
          {open ? 'CANCEL' : 'REWARD'}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t-[3px] border-ink pt-4">
          <div>
            <label className="mb-1 block font-display text-[10px] uppercase tracking-[0.14em] text-ink/60">
              MiniPay Cash Link URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="brutal-input w-full"
              placeholder="https://cash.minipay.xyz/#..."
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block font-display text-[10px] uppercase tracking-[0.14em] text-ink/60">
                Amount
              </label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="brutal-input w-full"
                placeholder="2"
              />
            </div>
            <div className="w-28">
              <label className="mb-1 block font-display text-[10px] uppercase tracking-[0.14em] text-ink/60">
                Token
              </label>
              <select
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="brutal-input w-full"
              >
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
                <option value="USDm">USDm</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="font-body text-[12px] text-red-600">{error}</div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="brutal-btn w-full px-4 py-3 font-display text-[12px] tracking-[0.14em] disabled:opacity-50"
          >
            {busy ? 'ISSUING…' : `SEND TO ${shortAddr(grant.address)}`}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Pool top-up ──────────────────────────────────────────────────────────────

const PoolLoader: React.FC<{ adminAddress: string; onLoaded: () => void }> = ({
  adminAddress,
  onLoaded,
}) => {
  const [level, setLevel] = useState(4)
  const [amount, setAmount] = useState('')
  const [token, setToken] = useState('USDT')
  const [urls, setUrls] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const submit = async () => {
    const list = urls
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean)

    if (list.length === 0 || !amount.trim()) {
      setMessage('Paste at least one link and set an amount.')
      return
    }
    setBusy(true)
    setMessage(null)
    const result = await loadMilestonePool(
      adminAddress,
      level,
      list.map((cashLinkUrl) => ({ cashLinkUrl, amount: amount.trim(), token }))
    )
    setBusy(false)
    setMessage(
      result.ok
        ? `Loaded ${result.added} link${result.added === 1 ? '' : 's'} for level ${level}.`
        : (result.error ?? 'Failed to load the pool.')
    )
    if (result.ok) {
      setUrls('')
      onLoaded()
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="w-28">
          <label className="mb-1 block font-display text-[10px] uppercase tracking-[0.14em] text-ink/60">
            Level
          </label>
          <select
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
            className="brutal-input w-full"
          >
            {MILESTONE_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block font-display text-[10px] uppercase tracking-[0.14em] text-ink/60">
            Amount per link
          </label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="brutal-input w-full"
            placeholder="2"
          />
        </div>
        <div className="w-28">
          <label className="mb-1 block font-display text-[10px] uppercase tracking-[0.14em] text-ink/60">
            Token
          </label>
          <select
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="brutal-input w-full"
          >
            <option value="USDT">USDT</option>
            <option value="USDC">USDC</option>
            <option value="USDm">USDm</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block font-display text-[10px] uppercase tracking-[0.14em] text-ink/60">
          Cash links — one per line
        </label>
        <textarea
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          rows={4}
          className="brutal-input w-full font-body text-[12px]"
          placeholder={
            'https://cash.minipay.xyz/#...\nhttps://cash.minipay.xyz/#...'
          }
        />
      </div>

      {message && <div className="font-body text-[12px]">{message}</div>}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="brutal-btn w-full px-4 py-3 font-display text-[12px] tracking-[0.14em] disabled:opacity-50"
      >
        {busy ? 'LOADING…' : 'FUND POOL'}
      </button>
    </div>
  )
}

// ── Panel ────────────────────────────────────────────────────────────────────

/**
 * Cash-milestone ledger for the admin console.
 *
 * Players reaching level 4, 8 or 12 are paid automatically while the pool has
 * funded links. Anything the pool could not cover lands in OWED, which is the
 * queue this panel exists to clear.
 *
 * Level 1 appears here too, as a test milestone: only the addresses whitelisted
 * server-side draw from its pool.
 */
const LevelMilestonesPanel: React.FC<{ adminAddress: string }> = ({
  adminAddress,
}) => {
  const { data, isLoading, error, refetch } = useLevelMilestones(adminAddress)

  return (
    <div className="mt-12">
      <div
        className="inline-block border-4 border-ink bg-accent-lime px-4 py-2 font-display text-[11px] tracking-[0.16em]"
        style={{
          boxShadow: '4px 4px 0 var(--shadow)',
          transform: 'rotate(-1deg)',
        }}
      >
        LADDER
      </div>
      <h2
        className="mt-5 font-display text-[clamp(1.8rem,4vw,3rem)] leading-none"
        style={{ letterSpacing: '-0.04em' }}
      >
        CASH MILESTONES
      </h2>
      <p className="mt-2 font-body text-[13px] uppercase tracking-[0.16em] text-ink/60">
        Players who reached level 4, 8 or 12 — plus level 1 for whitelisted
        testers.
      </p>

      {error && (
        <div className="mt-6 border-[3px] border-ink bg-accent-pink p-4 font-body text-[13px]">
          {error}
        </div>
      )}

      {/* ── Pool stock ── */}
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {MILESTONE_LEVELS.map((level) => {
          const left = data.available[String(level)] ?? 0
          return (
            <div
              key={level}
              className="border-[3px] border-ink p-4"
              style={{
                background: left === 0 ? 'var(--paper-pink)' : 'var(--paper-2)',
                boxShadow: '4px 4px 0 var(--shadow)',
              }}
            >
              <div className="font-display text-[10px] uppercase tracking-[0.14em] text-ink/60">
                Level {level} pool{level === 1 ? ' · test' : ''}
              </div>
              <div className="mt-1 font-display text-[26px] tabular-nums leading-none">
                {left}
              </div>
              <div className="mt-1 font-body text-[11px] text-ink/60">
                {left === 0 ? 'empty — players will queue' : 'links ready'}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* ── Owed ── */}
        <div>
          <div className="flex items-baseline justify-between">
            <h3
              className="font-display text-[22px]"
              style={{ letterSpacing: '-0.02em' }}
            >
              OWED ({data.pending.length})
            </h3>
            <button
              type="button"
              onClick={refetch}
              className="font-display text-[10px] uppercase tracking-[0.14em] text-ink/60 underline"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {isLoading && data.pending.length === 0 && (
              <div className="font-body text-[13px] text-ink/60">Loading…</div>
            )}
            {!isLoading && data.pending.length === 0 && (
              <div className="border-[3px] border-dashed border-ink/30 p-6 text-center font-body text-[13px] text-ink/60">
                Nobody is waiting on a payout.
              </div>
            )}
            {data.pending.map((grant) => (
              <PendingRow
                key={grant.id}
                grant={grant}
                adminAddress={adminAddress}
                onSettled={refetch}
              />
            ))}
          </div>
        </div>

        {/* ── Fund the pool ── */}
        <div>
          <h3
            className="font-display text-[22px]"
            style={{ letterSpacing: '-0.02em' }}
          >
            FUND POOL
          </h3>
          <p className="mt-1 font-body text-[12px] text-ink/60">
            Links are handed out one per player, oldest first. Load a batch and
            milestones pay out automatically.
          </p>
          <div className="mt-4 border-[3px] border-ink bg-paper p-4">
            <PoolLoader adminAddress={adminAddress} onLoaded={refetch} />
          </div>
        </div>
      </div>

      {/* ── Already paid ── */}
      <div className="mt-10">
        <h3
          className="font-display text-[22px]"
          style={{ letterSpacing: '-0.02em' }}
        >
          REWARDED ({data.paid.length})
        </h3>
        <div className="mt-4 space-y-2">
          {data.paid.length === 0 && (
            <div className="font-body text-[13px] text-ink/60">
              No milestones paid yet.
            </div>
          )}
          {data.paid.map((grant) => (
            <div
              key={grant.id}
              className="flex flex-wrap items-center justify-between gap-2 border-[2px] border-ink px-3 py-2"
              style={{ background: 'var(--paper-2)' }}
            >
              <span className="font-display text-[11px]">
                LVL {grant.level} · {grant.name}
              </span>
              <span className="font-body text-[12px] text-ink/60">
                <span className="select-all">{shortAddr(grant.address)}</span> ·{' '}
                {when(grant.granted_at)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default LevelMilestonesPanel

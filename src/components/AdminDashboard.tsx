import React, { useState, useEffect } from 'react'
import {
  useCreateTournament,
  useWithdrawRevenue,
  useProtocolRevenue,
  usePauseTournament,
  useSetProtocolFee,
  useIsPaused,
  useSetSigner,
  useProtocolFeeBps,
  useTournamentCount,
  USDC_DECIMALS,
} from '../hooks/useBlokzGame'
import { parseUnits, formatUnits } from 'viem'
import { useChainId, useWaitForTransactionReceipt, useAccount, usePublicClient } from 'wagmi'
import { celo } from 'wagmi/chains'
import LevelMilestonesPanel from './LevelMilestonesPanel'
import {
  useAdminRewards,
  adminAddReward,
  adminDeleteReward,
} from '../hooks/useRewards'

const ADMIN_ADDRESS = '0xe1a0f916e859624d4edbada23e4382d327eaf626'

const AdminDashboard: React.FC = () => {
  const { address } = useAccount()
  const isAdmin = address?.toLowerCase() === ADMIN_ADDRESS
  const {
    createTournament,
    hash: createHash,
    isPending: isCreating,
    isSuccess: isCreateSuccess,
    error: createError,
  } = useCreateTournament()
  const { isLoading: isWaitingCreate, isError: isCreateReverted } = useWaitForTransactionReceipt({ hash: createHash })

  const {
    withdraw,
    hash: withdrawHash,
    isPending: isWithdrawing,
    isSuccess: isWithdrawSuccess,
    error: withdrawError,
  } = useWithdrawRevenue()
  const { isError: isWithdrawReverted } = useWaitForTransactionReceipt({ hash: withdrawHash })
  
  const { setPaused, isPending: isPausing } = usePauseTournament()
  const { setFee: setContractFee, isPending: isSettingFee } = useSetProtocolFee()
  const { paused, isLoading: isLoadingPaused, refetch: refetchPaused } = useIsPaused()
  const { setSigner, isPending: isSettingSigner } = useSetSigner()
  const { bps: currentFeeBps, isLoading: isLoadingFee, refetch: refetchFee } = useProtocolFeeBps()
  const { count: tCount, refetch: refetchCount } = useTournamentCount()
  const { revenue, isLoading: isLoadingRevenue, refetch: refetchRevenue } = useProtocolRevenue()
  
  const chainId = useChainId()
  const isWrongChain = chainId !== celo.id

  const publicClient = usePublicClient()
  const [fee, setFee] = useState('0.1')
  const [duration, setDuration] = useState('24') // hours
  const [maxPlayers, setMaxPlayers] = useState('100')
  const [createValidationError, setCreateValidationError] = useState<string | null>(null)
  const [protocolFeeInput, setProtocolFeeInput] = useState('10') // %
  const [newSigner, setNewSigner] = useState('')

  // ─── Rewards state ───────────────────────────────────────────────────────────
  const { rewards: allRewards, isLoading: isLoadingRewards, refetch: refetchRewards } =
    useAdminRewards(isAdmin ? address : undefined)

  const [rAddress, setRAddress] = useState('')
  const [rCashLink, setRCashLink] = useState('')
  const [rAmount, setRAmount] = useState('')
  const [rToken, setRToken] = useState('USDT')
  const [rLabel, setRLabel] = useState('')
  const [rAdding, setRAdding] = useState(false)
  const [rSuccess, setRSuccess] = useState(false)
  const [rError, setRError] = useState<string | null>(null)

  const handleAddReward = async () => {
    if (!address || !rAddress || !rCashLink || !rAmount || !rLabel) return
    setRAdding(true)
    setRError(null)
    const result = await adminAddReward(address, {
      address: rAddress,
      cashLinkUrl: rCashLink,
      amount: rAmount,
      token: rToken,
      label: rLabel,
    })
    setRAdding(false)
    if (result.ok) {
      setRAddress(''); setRCashLink(''); setRAmount(''); setRLabel('')
      setRSuccess(true)
      refetchRewards()
      setTimeout(() => setRSuccess(false), 2500)
    } else {
      setRError(result.error ?? 'Failed to add reward')
    }
  }

  const handleDeleteReward = async (id: string) => {
    if (!address) return
    const result = await adminDeleteReward(address, id)
    if (result.ok) refetchRewards()
    else alert(result.error)
  }

  useEffect(() => {
    if (isCreateSuccess) refetchCount()
  }, [isCreateSuccess, refetchCount])

  const handleRefresh = () => {
    refetchPaused()
    refetchFee()
    refetchCount()
    refetchRevenue()
  }

  const handleCreate = async () => {
    setCreateValidationError(null)

    // Mirror the contract's createTournament checks so bad params fail here
    // with a clear message instead of reverting on-chain and burning gas.
    const max = Number(maxPlayers)
    if (!Number.isInteger(max) || max < 2 || max > 100) {
      setCreateValidationError('Max players must be between 2 and 100')
      return
    }
    const durationHours = Number(duration)
    if (!Number.isFinite(durationHours) || durationHours <= 0) {
      setCreateValidationError('Duration must be greater than 0 hours')
      return
    }
    let feeWei: bigint
    try {
      feeWei = parseUnits(fee, USDC_DECIMALS)
      if (feeWei < 0n) throw new Error()
    } catch {
      setCreateValidationError('Entry fee is not a valid amount')
      return
    }

    // Anchor the start time to the chain clock, not the device clock — a
    // skewed device clock behind chain time makes start <= block.timestamp
    // and the contract rejects it. Fall back to Date.now() if the read fails.
    let chainNow = BigInt(Math.floor(Date.now() / 1000))
    try {
      const block = await publicClient?.getBlock()
      if (block) chainNow = block.timestamp
    } catch {}

    const start = chainNow + 120n // 2 min from chain time
    const end = start + BigInt(Math.round(durationHours * 3600))
    // Default rewards: 1st: 50%, 2nd: 30%, 3rd: 20% of prize pool (post-fee)
    createTournament(feeWei, start, end, max, [5000, 3000, 2000])
  }

  return (
    <div className="brutal-dot-bg mx-auto w-full max-w-5xl px-6 py-24">
      <div className="mb-12">
        <div
          className="inline-block border-4 border-ink bg-accent-yellow px-4 py-2 font-display text-[11px] tracking-[0.16em]"
          style={{ boxShadow: '4px 4px 0 var(--shadow)', transform: 'rotate(-2deg)' }}
        >
          OWNER CONTROLS
        </div>
        <h1
          className="mt-5 font-display text-[clamp(2.5rem,5vw,4.25rem)] leading-none"
          style={{ letterSpacing: '-0.04em' }}
        >
          ADMIN CONSOLE
        </h1>
        <p className="mt-2 font-body text-[13px] uppercase tracking-[0.16em] text-ink/60">
          Manage tournaments and protocol revenue.
        </p>
        <div className="mt-4 flex gap-4">
          <button 
            onClick={handleRefresh}
            className="brutal-btn border-2 border-ink bg-paper px-4 py-1 font-display text-[10px] uppercase"
          >
            REFRESH DATA
          </button>
        </div>
      </div>

      {isWrongChain && (
        <div className="mb-8 border-4 border-danger bg-danger px-6 py-3 font-display text-xs uppercase tracking-widest text-paper animate-pulse">
          ⚠️ WRONG NETWORK: PLEASE SWITCH TO CELO MAINNET
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div
          className="border-4 border-ink bg-accent-cyan p-8"
          style={{ boxShadow: '8px 8px 0 var(--shadow)' }}
        >
          <h2
            className="mb-6 font-display text-[28px]"
            style={{ letterSpacing: '-0.03em' }}
          >
            DEPLOY TOURNAMENT
          </h2>

          <div className="space-y-6">
            <div>
              <label className="mb-2 block font-display text-[10px] uppercase tracking-[0.14em] text-ink/60">
                Entry Fee (USDC)
              </label>
              <input
                type="number"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                className="brutal-input w-full"
                placeholder="0.1"
              />
            </div>

            <div>
              <label className="mb-2 block font-display text-[10px] uppercase tracking-[0.14em] text-ink/60">
                Duration (Hours)
              </label>
              <input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="brutal-input w-full"
                placeholder="24"
              />
              {/* Quick presets — the contract accepts any end > start, so a
                  tournament can run for hours, days, or weeks */}
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { label: '6H', hours: 6 },
                  { label: '24H', hours: 24 },
                  { label: '3 DAYS', hours: 72 },
                  { label: '1 WEEK', hours: 168 },
                  { label: '2 WEEKS', hours: 336 },
                  { label: '1 MONTH', hours: 720 },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setDuration(String(p.hours))}
                    className="brutal-btn border-2 border-ink px-3 py-1 font-display text-[9px] uppercase tracking-[0.12em]"
                    style={{
                      background:
                        Number(duration) === p.hours ? 'var(--ink)' : 'var(--paper)',
                      color:
                        Number(duration) === p.hours ? 'var(--paper)' : 'var(--ink)',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 font-body text-[10px] text-ink/50">
                {Number(duration) >= 24 && Number.isFinite(Number(duration))
                  ? `≈ ${(Number(duration) / 24).toLocaleString(undefined, { maximumFractionDigits: 1 })} day(s)`
                  : 'Any duration works — hours, days, or weeks'}
              </p>
            </div>

            <div>
              <label className="mb-2 block font-display text-[10px] uppercase tracking-[0.14em] text-ink/60">
                Max Players
              </label>
              <input
                type="number"
                min={2}
                max={100}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
                className="brutal-input w-full"
                placeholder="100"
              />
              <p className="mt-1 font-body text-[10px] text-ink/50">
                2–100 players (contract limit)
              </p>
            </div>

            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="brutal-btn w-full border-4 border-ink bg-danger py-4 font-display text-[12px] tracking-[0.14em] text-paper disabled:opacity-50"
              style={{ boxShadow: '6px 6px 0 var(--shadow)' }}
            >
              {isCreating ? 'DEPLOYING...' : 'FIRE TOURNAMENT'}
            </button>

            {createValidationError && (
              <div className="mt-4 text-center font-display text-[10px] uppercase tracking-widest text-danger">
                {createValidationError}
              </div>
            )}
            {isCreateSuccess && !isCreateReverted && (
              <div className="mt-4 text-center font-display text-[10px] uppercase tracking-widest text-accent-lime">
                Tournament live on-chain
              </div>
            )}
            {isCreateReverted && (
              <div className="mt-4 text-center font-display text-[10px] uppercase tracking-widest text-danger">
                Transaction Reverted on-chain (Check Roles/Params)
              </div>
            )}
            {createError && (
              <div className="mt-4 text-center font-display text-[10px] uppercase tracking-widest text-danger">
                Error: {createError.message.slice(0, 50)}...
              </div>
            )}
          </div>
        </div>

        <div
          className="border-4 border-ink bg-accent-pink p-8"
          style={{ boxShadow: '8px 8px 0 var(--shadow)' }}
        >
          <h2
            className="mb-6 font-display text-[28px]"
            style={{ letterSpacing: '-0.03em' }}
          >
            PROTOCOL TREASURY
          </h2>

          <div
            className="mb-8 border-4 border-ink bg-paper-2 p-6"
            style={{ boxShadow: '5px 5px 0 var(--shadow)' }}
          >
            <div className="mb-2 font-display text-[10px] uppercase tracking-[0.14em] text-ink/60">
              Accumulated Revenue
            </div>
            <div
              className="font-display text-[40px]"
              style={{ letterSpacing: '-0.04em', lineHeight: 1 }}
            >
              {isLoadingRevenue
                ? '...'
                : revenue !== undefined
                  ? formatUnits(revenue, USDC_DECIMALS)
                  : '0'}{' '}
              USDC
            </div>
          </div>

          <div
            className="mb-8 border-4 border-ink bg-paper-2 p-6"
            style={{ boxShadow: '5px 5px 0 var(--shadow)' }}
          >
            <div className="mb-4 font-display text-[10px] uppercase tracking-[0.14em] text-ink/60">
              Protocol Configuration
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-display text-[11px]">System Status</span>
                <button
                  onClick={() => setPaused(!paused)}
                  disabled={isPausing || isLoadingPaused}
                  className={`brutal-btn border-2 border-ink px-4 py-1 font-display text-[10px] uppercase ${paused ? 'bg-danger text-paper' : 'bg-accent-lime'}`}
                >
                  {isLoadingPaused ? '...' : paused ? 'RESUME' : 'PAUSE CONTRACT'}
                </button>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="mb-1 block font-display text-[8px] uppercase opacity-60">
                    Fee (%) — Current: {isLoadingFee ? '...' : (Number(currentFeeBps || 1000) / 100)}%
                  </label>
                  <input
                    type="number"
                    value={protocolFeeInput}
                    onChange={(e) => setProtocolFeeInput(e.target.value)}
                    className="brutal-input w-full text-xs"
                    placeholder="10"
                  />
                </div>
                <button
                  onClick={() => setContractFee(Number(protocolFeeInput) * 100)}
                  disabled={isSettingFee}
                  className="brutal-btn mt-4 border-2 border-ink bg-accent-yellow px-4 py-2 font-display text-[10px] uppercase"
                >
                  SET
                </button>
              </div>

              <div className="pt-2">
                <label className="mb-1 block font-display text-[8px] uppercase opacity-60">Add Trusted Signer (Address)</label>
                <div className="flex items-center gap-4">
                  <input
                    type="text"
                    value={newSigner}
                    onChange={(e) => setNewSigner(e.target.value)}
                    className="brutal-input flex-1 text-[10px]"
                    placeholder="0x..."
                  />
                  <button
                    onClick={() => setSigner(newSigner as `0x${string}`)}
                    disabled={isSettingSigner || !newSigner}
                    className="brutal-btn border-2 border-ink bg-paper px-4 py-2 font-display text-[10px] uppercase"
                  >
                    GRANT
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => address && withdraw(address)}
            disabled={isWithdrawing || !address}
            className="brutal-btn w-full border-4 border-ink bg-accent-lime py-4 font-display text-[12px] tracking-[0.14em] text-ink disabled:opacity-50"
            style={{ boxShadow: '6px 6px 0 var(--shadow)' }}
          >
            {isWithdrawing ? 'PROCESSING...' : 'WITHDRAW REVENUE'}
          </button>

          {isWithdrawSuccess && (
            <p className="mt-4 animate-pulse text-center font-display text-[10px] tracking-[0.12em] text-accent-lime">
              SUCCESS. FUNDS SENT TO OWNER.
            </p>
          )}

          <div className="mt-8 border-4 border-ink bg-accent-yellow p-4">
            <p className="font-display text-[9px] leading-relaxed tracking-[0.14em] text-ink">
              Only the contract owner can perform these actions. Ensure your
              connected wallet is the deployment account.
            </p>
          </div>

          {withdrawError && (
            <div className="mt-4 whitespace-pre-wrap break-words border-4 border-danger bg-paper-2 p-3 text-[10px] text-danger">
              <span className="font-display">ERROR:</span>{' '}
              {withdrawError.message}
            </div>
          )}
        </div>
      </div>

      {/* ── Campaign Rewards ────────────────────────────────────────────────── */}
      {isAdmin && (
        <div className="mt-12">
          <div
            className="inline-block border-4 border-ink bg-accent-lime px-4 py-2 font-display text-[11px] tracking-[0.16em]"
            style={{ boxShadow: '4px 4px 0 var(--shadow)', transform: 'rotate(-1deg)' }}
          >
            REWARDS
          </div>
          <h2
            className="mt-5 font-display text-[clamp(1.8rem,4vw,3rem)] leading-none"
            style={{ letterSpacing: '-0.04em' }}
          >
            CAMPAIGN REWARDS
          </h2>
          <p className="mt-2 font-body text-[13px] uppercase tracking-[0.16em] text-ink/60">
            Add MiniPay cash links for campaign winners.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
            {/* Add reward form */}
            <div
              className="border-4 border-ink bg-accent-lime p-8"
              style={{ boxShadow: '8px 8px 0 var(--shadow)' }}
            >
              <h3 className="mb-6 font-display text-[22px]" style={{ letterSpacing: '-0.02em' }}>
                ADD REWARD
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block font-display text-[10px] uppercase tracking-[0.14em] text-ink/60">
                    Player Address
                  </label>
                  <input
                    type="text"
                    value={rAddress}
                    onChange={e => setRAddress(e.target.value)}
                    className="brutal-input w-full"
                    placeholder="0x..."
                  />
                </div>
                <div>
                  <label className="mb-1 block font-display text-[10px] uppercase tracking-[0.14em] text-ink/60">
                    Label (e.g. Week 1 — Rank #1)
                  </label>
                  <input
                    type="text"
                    value={rLabel}
                    onChange={e => setRLabel(e.target.value)}
                    className="brutal-input w-full"
                    placeholder="Week 1 — Rank #1"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block font-display text-[10px] uppercase tracking-[0.14em] text-ink/60">
                      Amount
                    </label>
                    <input
                      type="text"
                      value={rAmount}
                      onChange={e => setRAmount(e.target.value)}
                      className="brutal-input w-full"
                      placeholder="10"
                    />
                  </div>
                  <div className="w-28">
                    <label className="mb-1 block font-display text-[10px] uppercase tracking-[0.14em] text-ink/60">
                      Token
                    </label>
                    <select
                      value={rToken}
                      onChange={e => setRToken(e.target.value)}
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
                    MiniPay Cash Link URL
                  </label>
                  <input
                    type="text"
                    value={rCashLink}
                    onChange={e => setRCashLink(e.target.value)}
                    className="brutal-input w-full"
                    placeholder="https://minipay.opera.com/link/..."
                  />
                </div>
                <button
                  onClick={handleAddReward}
                  disabled={rAdding || !rAddress || !rCashLink || !rAmount || !rLabel}
                  className="brutal-btn w-full border-4 border-ink bg-ink py-4 font-display text-[12px] tracking-[0.14em] text-paper disabled:opacity-50"
                  style={{ boxShadow: '6px 6px 0 var(--shadow)' }}
                >
                  {rAdding ? 'ADDING...' : rSuccess ? '✓ REWARD ADDED' : 'ADD REWARD'}
                </button>
                {rError && (
                  <div className="border-2 border-danger p-3 font-display text-[10px] uppercase tracking-wider text-danger">
                    {rError}
                  </div>
                )}
              </div>
            </div>

            {/* All rewards list */}
            <div
              className="border-4 border-ink bg-paper-2 p-8"
              style={{ boxShadow: '8px 8px 0 var(--shadow)' }}
            >
              <div className="mb-6 flex items-center justify-between">
                <h3 className="font-display text-[22px]" style={{ letterSpacing: '-0.02em' }}>
                  ALL REWARDS
                </h3>
                <button
                  onClick={refetchRewards}
                  className="brutal-btn border-2 border-ink bg-paper px-3 py-1 font-display text-[10px] uppercase"
                >
                  REFRESH
                </button>
              </div>
              {isLoadingRewards ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-14 animate-pulse border-2 border-ink bg-paper" />
                  ))}
                </div>
              ) : allRewards.length === 0 ? (
                <div className="border-2 border-ink bg-paper p-6 text-center font-display text-[11px] uppercase tracking-widest text-ink/50">
                  No rewards yet
                </div>
              ) : (
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {allRewards.map(r => (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 border-2 border-ink p-3"
                      style={{ background: r.claimed_at ? 'var(--paper)' : 'var(--accent-yellow)' }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-display text-[11px] uppercase tracking-[0.08em]">
                          {r.label}
                        </div>
                        <div className="mt-0.5 font-display text-[10px] opacity-60">
                          {r.address.slice(0, 6)}…{r.address.slice(-4)} · {r.amount} {r.token}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className="border-2 border-ink px-2 py-0.5 font-display text-[9px] uppercase tracking-wider"
                          style={{
                            background: r.claimed_at ? 'var(--accent-lime)' : 'var(--ink)',
                            color: r.claimed_at ? 'var(--ink-fixed)' : 'var(--paper)',
                          }}
                        >
                          {r.claimed_at ? 'CLAIMED' : 'PENDING'}
                        </span>
                        {!r.claimed_at && (
                          <button
                            onClick={() => handleDeleteReward(r.id)}
                            className="brutal-btn border-2 border-ink bg-danger px-2 py-0.5 font-display text-[9px] uppercase text-paper"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isAdmin && address && <LevelMilestonesPanel adminAddress={address} />}
    </div>
  )
}

export default AdminDashboard

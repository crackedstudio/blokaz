import React, { useState } from 'react'
import {
  useCreateTournament,
  useWithdrawRevenue,
  useProtocolRevenue,
  USDC_DECIMALS,
} from '../hooks/useBlokzGame'
import { parseUnits, formatUnits } from 'viem'

const AdminDashboard: React.FC = () => {
  const {
    createTournament,
    isPending: isCreating,
    isSuccess: isCreateSuccess,
    error: createError,
  } = useCreateTournament()
  const {
    withdraw,
    isPending: isWithdrawing,
    isSuccess: isWithdrawSuccess,
    error: withdrawError,
  } = useWithdrawRevenue()
  const { revenue, isLoading: isLoadingRevenue } = useProtocolRevenue()

  const [fee, setFee] = useState('0.1')
  const [duration, setDuration] = useState('24') // hours
  const [maxPlayers, setMaxPlayers] = useState('100')

  const handleCreate = () => {
    const feeWei = parseUnits(fee, USDC_DECIMALS)
    const start = BigInt(Math.floor(Date.now() / 1000) + 60) // 60 seconds from now
    const end = start + BigInt(Number(duration) * 3600)
    createTournament(feeWei, start, end, Number(maxPlayers))
  }

  return (
    <div className="brutal-dot-bg mx-auto w-full max-w-5xl px-6 py-24">
      <div className="mb-12">
        <div
          className="inline-block border-4 border-ink bg-accent-yellow px-4 py-2 font-display text-[11px] tracking-[0.16em]"
          style={{ boxShadow: '4px 4px 0 var(--ink)', transform: 'rotate(-2deg)' }}
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
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div
          className="border-4 border-ink bg-accent-cyan p-8"
          style={{ boxShadow: '8px 8px 0 var(--ink)' }}
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
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="brutal-input w-full"
                placeholder="24"
              />
            </div>

            <div>
              <label className="mb-2 block font-display text-[10px] uppercase tracking-[0.14em] text-ink/60">
                Max Players
              </label>
              <input
                type="number"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
                className="brutal-input w-full"
                placeholder="100"
              />
            </div>

            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="brutal-btn w-full border-4 border-ink bg-danger py-4 font-display text-[12px] tracking-[0.14em] text-paper disabled:opacity-50"
              style={{ boxShadow: '6px 6px 0 var(--ink)' }}
            >
              {isCreating ? 'DEPLOYING...' : 'FIRE TOURNAMENT'}
            </button>

            {isCreateSuccess && (
              <p className="animate-pulse text-center font-display text-[10px] tracking-[0.12em] text-accent-lime">
                TOURNAMENT LIVE ON-CHAIN
              </p>
            )}

            {createError && (
              <div className="whitespace-pre-wrap break-words border-4 border-danger bg-paper-2 p-3 text-[10px] text-danger">
                <span className="font-display">ERROR:</span>{' '}
                {createError.message}
              </div>
            )}
          </div>
        </div>

        <div
          className="border-4 border-ink bg-accent-pink p-8"
          style={{ boxShadow: '8px 8px 0 var(--ink)' }}
        >
          <h2
            className="mb-6 font-display text-[28px]"
            style={{ letterSpacing: '-0.03em' }}
          >
            PROTOCOL TREASURY
          </h2>

          <div
            className="mb-8 border-4 border-ink bg-paper-2 p-6"
            style={{ boxShadow: '5px 5px 0 var(--ink)' }}
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

          <button
            onClick={() => withdraw()}
            disabled={isWithdrawing}
            className="brutal-btn w-full border-4 border-ink bg-accent-lime py-4 font-display text-[12px] tracking-[0.14em] text-ink disabled:opacity-50"
            style={{ boxShadow: '6px 6px 0 var(--ink)' }}
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
    </div>
  )
}

export default AdminDashboard

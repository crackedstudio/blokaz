import React from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { useOwner } from '../hooks/useBlokzGame'
import { useTheme } from '../hooks/useTheme'
import { BrutalIcon } from './BrutalIcon'

type HeaderView = 'classic' | 'tournaments' | 'tournament-play' | 'admin'

interface HeaderProps {
  onShowLeaderboard?: () => void
  onViewChange: (view: 'classic' | 'tournaments' | 'admin') => void
  activeView: HeaderView
  showLeaderboardAction: boolean
  isLeaderboardOpen?: boolean
}

const MobileBottomNav: React.FC<{
  activeView: HeaderView
  isLeaderboardOpen: boolean
  onViewChange: (view: 'classic' | 'tournaments' | 'admin') => void
  onShowLeaderboard?: () => void
  isOwner: boolean
}> = ({ activeView, isLeaderboardOpen, onViewChange, onShowLeaderboard, isOwner }) => {
  const tabs = [
    {
      label: 'CLASSIC',
      icon: 'zap' as const,
      active: activeView === 'classic' && !isLeaderboardOpen,
      onClick: () => onViewChange('classic'),
    },
    {
      label: 'TOURNEY',
      icon: 'trophy' as const,
      active: activeView === 'tournaments' || activeView === 'tournament-play',
      onClick: () => onViewChange('tournaments'),
    },
    {
      label: 'RANKS',
      icon: 'trending' as const,
      active: isLeaderboardOpen,
      onClick: onShowLeaderboard,
    },
    ...(isOwner
      ? [
          {
            label: 'ADMIN',
            icon: 'alert' as const,
            active: activeView === 'admin',
            onClick: () => onViewChange('admin'),
          },
        ]
      : []),
  ]

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex h-16 border-t-4 border-ink bg-paper lg:hidden"
      style={{ boxShadow: '0 -3px 0 var(--ink)' }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.label}
          onClick={tab.onClick}
          className={`flex flex-1 flex-col items-center justify-center gap-1 font-display text-[8px] tracking-[0.14em] uppercase ${
            tab.active ? 'bg-ink' : ''
          }`}
          style={{ color: tab.active ? 'var(--paper)' : 'var(--ink)' }}
        >
          <BrutalIcon name={tab.icon} size={18} strokeWidth={2.5} />
          {tab.label}
        </button>
      ))}
    </nav>
  )
}

const truncateAddress = (value?: string) =>
  value ? `${value.slice(0, 4)}…${value.slice(-2)}` : 'CONNECT'

export const Header: React.FC<HeaderProps> = ({
  onShowLeaderboard,
  onViewChange,
  activeView,
  showLeaderboardAction,
  isLeaderboardOpen = false,
}) => {
  const { address } = useAccount()
  const { owner } = useOwner()
  const { isDark, toggle } = useTheme()

  const isOwner =
    address && owner && address.toLowerCase() === owner.toLowerCase()
  const isTournamentView =
    activeView === 'tournaments' || activeView === 'tournament-play'

  const safeNavigate = (view: 'classic' | 'tournaments' | 'admin') => {
    if (typeof onViewChange === 'function') onViewChange(view)
  }

  return (
    <>
    <header className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between border-b-4 border-ink bg-paper px-6 py-4" style={{ borderBottomColor: 'var(--ink)' }}>
      {/* Logo */}
      <div
        className="flex cursor-pointer items-center gap-2 group"
        onClick={() => safeNavigate('classic')}
      >
        <div
          className="flex h-10 w-10 items-center justify-center border-4 border-ink bg-accent-yellow font-display text-xl transition-transform group-hover:-rotate-3"
          style={{ boxShadow: '3px 3px 0 var(--ink)', color: 'var(--ink-fixed)' }}
        >
          B
        </div>
        <span
          className="font-display text-2xl tracking-tighter text-ink"
        >
          BLOKAZ.
        </span>
      </div>

      {/* Nav tabs */}
      <div className="flex items-center gap-3">
        {[
          {
            label: 'CLASSIC',
            active: activeView === 'classic',
            view: 'classic' as const,
          },
          {
            label: 'TOURNAMENTS',
            active: isTournamentView,
            view: 'tournaments' as const,
          },
          {
            label: 'LEADERBOARD',
            active: isLeaderboardOpen,
            onClick: onShowLeaderboard
          },
          {
            label: 'MY STATS',
            active: false,
          },
          ...(isOwner
            ? [
                {
                  label: 'ADMIN',
                  active: activeView === 'admin',
                  view: 'admin' as const,
                },
              ]
            : []),
        ].map((tab) => (
          <button
            key={tab.label}
            onClick={() => tab.onClick ? tab.onClick() : tab.view && safeNavigate(tab.view)}
            className={`hidden font-display uppercase lg:block ${
              tab.active
                ? 'border-[3px] border-ink bg-ink px-[18px] py-[10px] text-[13px] tracking-[0.08em]'
                : 'brutal-btn border-[3px] border-ink bg-paper-2 px-4 py-2 text-[12px] tracking-[0.12em] text-ink'
            }`}
            style={{ boxShadow: tab.active ? 'none' : '4px 4px 0 var(--ink)' }}
          >
            <span style={{ color: tab.active ? 'var(--paper)' : 'inherit' }}>
              {tab.label}
            </span>
          </button>
        ))}

        {/* Theme Toggle */}
        <button
          onClick={toggle}
          className="brutal-btn ml-2 border-[3px] border-ink bg-paper-2 p-2"
          style={{ boxShadow: '4px 4px 0 var(--ink)' }}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <BrutalIcon name={isDark ? 'sun' : 'moon'} size={18} />
        </button>
      </div>

      {/* Wallet connect */}
      <ConnectButton.Custom>
        {({
          account,
          chain,
          mounted,
          openAccountModal,
          openChainModal,
          openConnectModal,
        }) => {
          const ready = mounted
          const connected = ready && account && chain

          const handleClick = () => {
            if (!connected) {
              openConnectModal()
              return
            }

            if (chain.unsupported) {
              openChainModal()
              return
            }

            openAccountModal()
          }

          return (
            <button
              onClick={handleClick}
              className="brutal-btn min-w-[88px] border-[3px] border-ink bg-paper px-4 py-[10px] font-display text-[12px] tracking-[0.08em] text-ink uppercase"
              style={{
                boxShadow: '4px 4px 0 var(--ink)',
                opacity: ready ? 1 : 0,
              }}
            >
              {connected
                ? truncateAddress(account.address)
                : chain?.unsupported
                  ? 'NETWORK'
                  : 'CONNECT'}
            </button>
          )
        }}
      </ConnectButton.Custom>
    </header>
    <MobileBottomNav
      activeView={activeView}
      isLeaderboardOpen={isLeaderboardOpen ?? false}
      onViewChange={onViewChange}
      onShowLeaderboard={onShowLeaderboard}
      isOwner={!!isOwner}
    />
    </>
  )
}

export default Header

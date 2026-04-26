import React from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { useOwner } from '../hooks/useBlokzGame'
import { useTheme } from '../hooks/useTheme'
import { BrutalIcon } from './BrutalIcon'
import { IS_MINIPAY } from '../utils/miniPay'
import { useGoodDollar } from '../hooks/useGoodDollar'

type HeaderView = 'lobby' | 'classic' | 'tournaments' | 'tournament-play' | 'admin'

interface HeaderProps {
  onShowLeaderboard?: () => void
  onViewChange: (view: 'lobby' | 'classic' | 'tournaments' | 'admin') => void
  activeView: HeaderView
  showLeaderboardAction: boolean
  isLeaderboardOpen?: boolean
}

const MiniPayWalletBadge: React.FC = () => {
  const { address, isConnected } = useAccount()
  const { isGSupported, gModeEnabled, isWhitelisted, gBalance, verificationUrl } = useGoodDollar()

  return (
    <div className="flex items-center gap-2">

      <div
        className="flex items-center gap-2 border-[3px] border-ink bg-accent-lime px-4 py-[10px] font-display text-[12px] tracking-[0.08em] text-ink uppercase"
        style={{ boxShadow: '4px 4px 0 var(--ink)' }}
      >
        <div className="h-2 w-2 rounded-full bg-ink animate-pulse" />
        {isConnected && address ? truncateAddress(address) : 'MINIPAY'}
      </div>

      {isGSupported && gModeEnabled && isConnected && (
        <div 
          className={`flex items-center gap-2 border-[3px] border-ink px-3 py-[10px] font-display text-[10px] tracking-widest uppercase shadow-[3px_3px_0_var(--ink)] ${isWhitelisted ? 'bg-paper text-ink' : 'bg-accent-pink text-white'}`}
        >
          {isWhitelisted ? (
             <span className="flex items-center gap-1">
               <BrutalIcon name="check" size={12} />
               {gBalance?.formatted?.slice(0, 5)} G$
             </span>
          ) : (
            <a href={verificationUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
              <BrutalIcon name="alert" size={12} />
              VERIFY G$
            </a>
          )}
        </div>
      )}
    </div>
  )
}

const MobileBottomNav: React.FC<{
  activeView: HeaderView
  isLeaderboardOpen: boolean
  onViewChange: (view: 'lobby' | 'classic' | 'tournaments' | 'admin') => void
  onShowLeaderboard?: () => void
  isOwner: boolean
}> = ({ activeView, isLeaderboardOpen, onViewChange, onShowLeaderboard, isOwner }) => {
  const tabs = [
    {
      label: 'HOME',
      icon: 'home' as const,
      active: activeView === 'lobby',
      onClick: () => onViewChange('lobby'),
    },
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
  const { isGSupported, gModeEnabled, isWhitelisted, gBalance, verificationUrl } = useGoodDollar()
  const { isConnected } = useAccount()

  const isOwner =
    address && owner && address.toLowerCase() === owner.toLowerCase()
  const isTournamentView =
    activeView === 'tournaments' || activeView === 'tournament-play'

  const safeNavigate = (view: 'lobby' | 'classic' | 'tournaments' | 'admin') => {
    if (typeof onViewChange === 'function') onViewChange(view)
  }

  return (
    <>
    <header className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between border-b-4 border-ink bg-paper px-4 py-3 lg:px-6 lg:py-4" style={{ borderBottomColor: 'var(--ink)' }}>
      {/* Logo */}
      <div
        className="flex cursor-pointer items-center gap-2 group"
        onClick={() => safeNavigate('lobby')}
      >
        <div
          className="flex h-9 w-9 items-center justify-center border-[3px] border-ink font-display text-lg transition-transform group-hover:-rotate-3"
          style={{ background: 'var(--accent-yellow)', boxShadow: '3px 3px 0 var(--ink)', color: 'var(--ink-fixed)' }}
        >
          B
        </div>
        <span className="font-display text-xl tracking-tight text-ink">
          BLOKAZ
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

        {/* Desktop G$ Info */}
        {!IS_MINIPAY && isGSupported && gModeEnabled && isConnected && (
          <div className="hidden lg:flex items-center gap-2">
            <div 
              className={`flex items-center gap-2 border-[3px] border-ink px-4 py-2 font-display text-[11px] tracking-widest uppercase shadow-[4px_4px_0_var(--ink)] ${isWhitelisted ? 'bg-paper-2 text-ink' : 'bg-accent-pink text-white'}`}
            >
              {isWhitelisted ? (
                <>
                  <img src="https://docs.gooddollar.org/~gitbook/image?url=https%3A%2F%2F1693836101-files.gitbook.io%2F~%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F-LfsEjhezedCgGFXCkms%252Ficon%252F7UuO7n9qO2vO6Z3z7N2N%252FGoodDollar_Icon_Green.png%3Falt%3Dmedia%26token%3D7f3b8b1b-7f1b-4f1b-8f1b-7f1b8f1b7f1b&width=32&dpr=2" alt="G$" className="w-4 h-4" />
                  {gBalance?.formatted?.slice(0, 6)} G$
                  <div className="ml-1 h-1.5 w-1.5 rounded-full bg-accent-lime" title="Verified Human" />
                </>
              ) : (
                <a href={verificationUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                  <BrutalIcon name="alert" size={14} />
                  VERIFY IDENTITY
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Wallet connect */}
      {IS_MINIPAY ? (
        <MiniPayWalletBadge />
      ) : (
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
      )}
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


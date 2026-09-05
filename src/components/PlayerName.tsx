import React from 'react'
import { useUsername } from '../hooks/useBlokzGame'

const truncated = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`

/**
 * A player's registered name, falling back to a shortened address.
 *
 * The registry is on-chain, so this is a contract read per row — fine for a
 * leaderboard-sized list, not for something rendered per frame. Shared by the
 * score rankings and the ladder standings so a player is called the same thing
 * on both.
 */
const PlayerName: React.FC<{
  address: string
  isCurrentUser?: boolean
  className?: string
}> = ({ address, isCurrentUser = false, className = 'font-body text-sm' }) => {
  const { username, isLoading } = useUsername(address as `0x${string}`)

  return (
    <span
      className={`${className} ${isCurrentUser ? 'font-bold' : ''}`}
      style={{ color: 'inherit' }}
    >
      {isLoading ? (
        <span className="inline-block h-3 w-20 animate-pulse rounded-sm bg-current opacity-20" />
      ) : (
        username || truncated(address)
      )}
    </span>
  )
}

export default PlayerName

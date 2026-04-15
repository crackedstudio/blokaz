import React, { useState, useEffect } from 'react'
import { useLeaderboard, useUsername, useSetUsername } from '../hooks/useBlokzGame'
import { useAccount } from 'wagmi'
import contractInfo from '../contract.json'

interface LeaderboardProps {
  isOpen: boolean
  onClose: () => void
}

const PlayerName: React.FC<{ address: string; isCurrentUser: boolean }> = ({ address, isCurrentUser }) => {
  const { username, isLoading } = useUsername(address as `0x${string}`)
  
  const truncatedAddress = (addr: string) => 
    `${addr.slice(0, 6)}...${addr.slice(-4)}`

  if (isLoading) return <div className="h-4 w-24 bg-white/5 animate-pulse rounded" />

  return (
    <span className={`font-mono text-sm ${isCurrentUser ? 'text-white font-bold' : 'text-gray-300'}`}>
      {username || truncatedAddress(address)}
    </span>
  )
}

const UsernameRegistration: React.FC = () => {
  const { address } = useAccount()
  const { username, refetch } = useUsername(address)
  const { setUsername, isPending, isConfirming, isSuccess } = useSetUsername()
  const [newName, setNewName] = useState('')

  useEffect(() => {
    if (isSuccess) {
      refetch()
      setNewName('')
    }
  }, [isSuccess, refetch])

  if (!address) return null

  return (
    <div className="p-4 mx-4 mb-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-400">
          {username ? 'Update Identity' : 'Set your Identity'}
        </h3>
        {username && (
          <span className="text-[10px] text-gray-500">
            Current: <span className="text-white font-bold">{username}</span>
          </span>
        )}
      </div>
      
      <div className="flex gap-2">
        <input 
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="3-16 characters"
          maxLength={16}
          disabled={isPending || isConfirming}
          className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500/50 transition-colors disabled:opacity-50"
        />
        <button 
          onClick={() => setUsername(newName)}
          disabled={!newName || newName.length < 3 || isPending || isConfirming}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 text-white text-xs font-bold rounded-xl transition-all active:scale-95"
        >
          {isPending || isConfirming ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            'Save'
          )}
        </button>
      </div>
      {isConfirming && (
        <p className="text-[9px] text-blue-400 mt-2 animate-pulse font-medium">
          Confirming on-chain...
        </p>
      )}
    </div>
  )
}

const Leaderboard: React.FC<LeaderboardProps> = ({ isOpen, onClose }) => {
  const { address } = useAccount()
  const { leaderboard, isLoading, currentEpoch } = useLeaderboard()

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed top-0 right-0 h-full w-full max-w-md bg-[#0a0a0c]/90 backdrop-blur-2xl border-l border-white/10 z-[70] transform transition-transform duration-500 ease-out shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5 mb-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                RANKINGS
              </h2>
              <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mt-1">
                {currentEpoch !== undefined ? `Epoch #${currentEpoch.toString()}` : 'Loading Epoch...'}
              </p>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors group"
            >
              <svg className="w-6 h-6 text-gray-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Identity Registration */}
          <UsernameRegistration />

          {/* List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
            <h3 className="px-2 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">
              Global Players
            </h3>
            
            {isLoading ? (
              // Loading State
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
              ))
            ) : leaderboard && leaderboard.length > 0 ? (
              leaderboard
                .sort((a, b) => b.score - a.score)
                .map((entry, index) => {
                  const isCurrentUser = address?.toLowerCase() === entry.player.toLowerCase()
                  const rank = index + 1
                  
                  return (
                    <div 
                      key={`${entry.gameId.toString()}-${entry.player}`}
                      className={`group flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 ${
                        isCurrentUser 
                          ? 'bg-blue-500/10 border-blue-500/30 shadow-[0_4px_20px_rgba(59,130,246,0.1)]' 
                          : 'bg-white/5 border-transparent hover:border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {/* Rank Indicator */}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg ${
                        rank === 1 ? 'bg-yellow-500/20 text-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.2)]' :
                        rank === 2 ? 'bg-gray-400/20 text-gray-400' :
                        rank === 3 ? 'bg-orange-600/20 text-orange-600' :
                        'bg-white/5 text-gray-500'
                      }`}>
                        {rank}
                      </div>

                      {/* Player Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <PlayerName address={entry.player} isCurrentUser={isCurrentUser} />
                          {isCurrentUser && (
                            <span className="text-[8px] bg-blue-500 text-white px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">
                              You
                            </span>
                          )}
                        </div>
                        <a 
                          href={`${contractInfo.explorer}/${entry.player}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-gray-600 hover:text-blue-400 transition-colors inline-flex items-center gap-1 mt-0.5"
                        >
                          Details
                          <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>

                      {/* Score */}
                      <div className="text-right">
                        <div className="text-xl font-black text-white tabular-nums">
                          {entry.score.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                          Pts
                        </div>
                      </div>
                    </div>
                  )
                })
            ) : (
              // Empty State
              <div className="flex flex-col items-center justify-center h-64 text-center opacity-30">
                <div className="w-16 h-16 border-2 border-dashed border-white/20 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium">Competition hasn't started</p>
                <p className="text-[10px] uppercase tracking-widest mt-1 italic">Be the bridge-head</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-white/5 bg-black/40 text-center">
            <p className="text-[9px] text-gray-600 uppercase tracking-[0.2em] leading-relaxed">
              Global identities are permanent. <br />
              Top players share native reward pool.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

export default Leaderboard

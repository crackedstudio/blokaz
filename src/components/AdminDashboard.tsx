import React, { useState } from 'react'
import { useCreateTournament, useWithdrawRevenue, useProtocolRevenue, USDC_DECIMALS } from '../hooks/useBlokzGame'
import { parseUnits, formatUnits } from 'viem'

const AdminDashboard: React.FC = () => {
  const { createTournament, isPending: isCreating, isSuccess: isCreateSuccess } = useCreateTournament()
  const { withdraw, isPending: isWithdrawing, isSuccess: isWithdrawSuccess } = useWithdrawRevenue()
  const { revenue, isLoading: isLoadingRevenue } = useProtocolRevenue()

  const [fee, setFee] = useState('0.1')
  const [duration, setDuration] = useState('24') // hours
  const [maxPlayers, setMaxPlayers] = useState('100')

  const handleCreate = () => {
    const feeWei = parseUnits(fee, USDC_DECIMALS)
    const start = BigInt(Math.floor(Date.now() / 1000) + 300) // 5 mins from now
    const end = start + BigInt(Number(duration) * 3600)
    createTournament(feeWei, start, end, Number(maxPlayers))
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="mb-12">
        <h1 className="text-4xl font-black tracking-tight mb-2">ADMIN CONSOLE</h1>
        <p className="text-gray-500 uppercase tracking-widest text-[10px] font-bold">Manage Tournaments & Protocol Revenue</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Tournament Creation */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <span className="text-blue-500 text-2xl">🏆</span> 
            Deploy New Tournament
          </h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Entry Fee (USDC)</label>
              <input 
                type="number" 
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="0.1"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Duration (Hours)</label>
              <input 
                type="number" 
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="24"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Max Players</label>
              <input 
                type="number" 
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="100"
              />
            </div>

            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-black rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-95 uppercase tracking-widest"
            >
              {isCreating ? 'Deploying...' : 'Fire Tournament'}
            </button>
            
            {isCreateSuccess && (
              <p className="text-center text-green-500 text-xs font-bold animate-pulse">Tournament live on-chain!</p>
            )}
          </div>
        </div>

        {/* Revenue Management */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <span className="text-green-500 text-2xl">💰</span> 
            Protocol Treasury
          </h2>
          
          <div className="p-6 bg-black/40 rounded-2xl border border-white/5 mb-8">
            <div className="text-[10px] text-gray-500 uppercase tracking-widest font-black mb-2">Accumulated Revenue</div>
            <div className="text-3xl font-black text-white">
              {isLoadingRevenue ? '...' : (revenue !== undefined ? formatUnits(revenue, USDC_DECIMALS) : '0')} USDC
            </div>
          </div>

          <button
            onClick={() => withdraw()}
            disabled={isWithdrawing}
            className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-black rounded-xl transition-all shadow-lg shadow-green-500/20 active:scale-95 uppercase tracking-widest"
          >
            {isWithdrawing ? 'Processing...' : 'Withdraw Revenue'}
          </button>
          
          {isWithdrawSuccess && (
            <p className="text-center text-green-500 text-xs font-bold mt-4 animate-pulse">Success! Funds sent to owner.</p>
          )}

          <div className="mt-8 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
            <p className="text-[9px] text-yellow-500 leading-relaxed font-bold uppercase tracking-widest">
              Only the contract owner can perform these actions. Ensure your connected wallet is the deployment account.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard

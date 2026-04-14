import { ConnectButton } from '@rainbow-me/rainbowkit'

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-black/20 backdrop-blur-md border-b border-white/10">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
          B
        </div>
        <h1 className="text-xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent tracking-tight">
          BLOKAZ
        </h1>
      </div>
      
      <div className="flex items-center gap-4">
        <ConnectButton 
          accountStatus="avatar" 
          chainStatus="icon" 
          showBalance={false}
        />
      </div>
    </header>
  )
}

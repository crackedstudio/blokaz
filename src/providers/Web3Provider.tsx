import '@rainbow-me/rainbowkit/styles.css'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { WagmiProvider, useConnect, useAccount } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config, injectedConnector } from '../config/wagmi'
import React, { useEffect } from 'react'

const queryClient = new QueryClient()

// Runs inside WagmiProvider so hooks work.
// The useEffect fires AFTER mount — by then MiniPay has already injected window.ethereum.
const MiniPayAutoConnect: React.FC = () => {
  const { connect } = useConnect()
  const { isConnected } = useAccount()

  useEffect(() => {
    // Only attempt auto-connect if NOT already connected
    if (isConnected) return

    const tryConnect = () => {
      if (typeof window === 'undefined' || !window.ethereum) return
      
      const isMiniPay = (window.ethereum as any).isMiniPay === true
      if (!isMiniPay) return

      // Attempt silent connection using the specialized injected connector.
      // MiniPay auto-grants accounts; this will establish the wagmi session
      // without needing a manual eth_requestAccounts call.
      connect({ connector: injectedConnector })
    }

    // Small delay to ensure MiniPay has finished injecting window.ethereum
    const timer = setTimeout(tryConnect, 1000)
    return () => clearTimeout(timer)
  }, [isConnected, connect])

  return null
}

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {/* Always mount — detects MiniPay inside useEffect after DOM is ready */}
        <MiniPayAutoConnect />
        <RainbowKitProvider
          theme={darkTheme()}
          appInfo={{ appName: 'Blokaz', learnMoreUrl: 'https://blokaz.com' }}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

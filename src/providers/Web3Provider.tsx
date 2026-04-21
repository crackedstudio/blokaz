import '@rainbow-me/rainbowkit/styles.css'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { WagmiProvider, useConnect, useAccount } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from '../config/wagmi'
import { IS_MINIPAY } from '../utils/miniPay'
import React, { useEffect } from 'react'

const queryClient = new QueryClient()

const MiniPayAutoConnect: React.FC = () => {
  const { connect, connectors } = useConnect()
  const { isConnected } = useAccount()

  useEffect(() => {
    if (!isConnected) {
      const injectedConnector = connectors.find((c) => c.id === 'injected')
      if (injectedConnector) connect({ connector: injectedConnector })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

export function Web3Provider({ children }: { children: React.ReactNode }) {
  if (IS_MINIPAY) {
    return (
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <MiniPayAutoConnect />
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    )
  }

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
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

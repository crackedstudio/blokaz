import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { injected } from 'wagmi/connectors'
import { http, custom, fallback } from 'wagmi'
import { celo } from 'wagmi/chains'

// Use the Infura RPC from .env as the secondary fallback.
const rpcUrl = import.meta.env.VITE_RPC as string | undefined

// Lazy EIP-1193 proxy: resolves window.ethereum at RPC call-time, NOT at module
// load time. This is critical for MiniPay — the provider is injected into
// window.ethereum asynchronously after the page loads. Capturing it at module
// evaluation time means it's undefined and the custom transport is silently
// dropped, forcing Wagmi onto the HTTP fallback. MiniPay's sandbox blocks
// HTTP-originated eth_estimateGas / eth_sendTransaction, producing the
// "unknown RPC error". With this proxy, every request checks window.ethereum
// live, so the injected MiniPay provider is always used once it is ready.
const lazyWindowEthereum = {
  request: async (args: { method: string; params?: unknown[] }) => {
    const provider = typeof window !== 'undefined'
      ? (window.ethereum as any)
      : undefined
    if (!provider) throw new Error('No injected EIP-1193 provider available')
    return provider.request(args)
  },
}

/**
 * Custom injected target for MiniPay.
 */
export const injectedConnector = injected({
  target() {
    return {
      id: 'injected',
      name:
        typeof window !== 'undefined' && (window.ethereum as any)?.isMiniPay
          ? 'MiniPay'
          : 'MetaMask',
      provider:
        typeof window !== 'undefined' ? (window.ethereum as any) : undefined,
    }
  },
})

// Single unified wagmi config.
export const config = getDefaultConfig({
  appName: 'Blokaz',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '',
  chains: [celo],
  connectors: [injectedConnector],
  transports: {
    [celo.id]: fallback([
      custom(lazyWindowEthereum),
      rpcUrl ? http(rpcUrl) : http('https://forno.celo.org'),
    ]),
  },
  ssr: false,
})

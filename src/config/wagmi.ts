import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { injected } from 'wagmi/connectors'
import { http, custom, fallback } from 'wagmi'
import { celo } from 'wagmi/chains'
import { web3AuthConnector } from './web3auth'

// Use the RPC from .env, fall back to the public Celo endpoint.
const rpcUrl = import.meta.env.VITE_RPC as string | undefined
const CELO_RPC = rpcUrl || 'https://forno.celo.org'

// ─── Smart Celo transport ────────────────────────────────────────────────────
//
// Why not the old `fallback([custom(lazyWindowEthereum), http(...)])`?
//
// viem's `fallback` only switches to the next transport on a *thrown error*.
// When MetaMask is connected to Ethereum mainnet (or any non-Celo chain) and
// we call eth_call / eth_estimateGas on a Celo contract address, MetaMask
// returns { result: "0x" } — a perfectly valid JSON-RPC success response.
// The fallback never fires, so every useReadContract hook silently decodes
// empty bytes, the gameboard shows nothing, and gas estimation produces a
// nonsense value that breaks writeContract for Web3Auth users.
//
// Solution: two explicit slots in the fallback —
//
//   Slot 0 (MiniPay only)   – throws immediately for any other provider so the
//                              fallback skips straight to slot 1. MiniPay's
//                              sandbox blocks HTTP eth_estimateGas /
//                              eth_sendTransaction, so we MUST keep using its
//                              injected provider here.
//
//   Slot 1 (everyone else)  – raw HTTP to Celo. Covers: Web3Auth users,
//                              MetaMask on any chain, and visitors with no
//                              wallet installed. Always talks to Celo.
//
// The wallet client (signing / sending) is always the connector's own provider
// (MiniPay injected → Celo, Web3Auth provider → Celo) so this transport only
// affects public-client reads and gas estimation.
const celoTransport = fallback([
  custom({
    async request({ method, params }: { method: string; params?: unknown[] }) {
      const p = typeof window !== 'undefined' ? (window.ethereum as any) : null
      if (!p?.isMiniPay) throw new Error('not-minipay')
      return p.request({ method, params })
    },
  }),
  http(CELO_RPC),
])

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
// web3AuthConnector is always registered so useConnect() can target it from
// any component; it only activates when the user explicitly clicks "SOCIAL".
// In the MiniPay code path the button is never rendered, so it stays dormant.
export const config = getDefaultConfig({
  appName: 'Blokaz',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '',
  chains: [celo],
  connectors: [injectedConnector, web3AuthConnector],
  transports: {
    [celo.id]: celoTransport,
  },
  ssr: false,
})

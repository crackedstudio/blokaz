import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { custom } from 'viem'
import { celo } from 'wagmi/chains'
import { IS_MINIPAY } from '../utils/miniPay'

// In MiniPay all reads AND writes must go through window.ethereum (the injected
// provider). Using http() would route reads through a public RPC that may differ
// from MiniPay's state, causing nonce/gas mismatches on writes.
const miniPayTransport = IS_MINIPAY && typeof window !== 'undefined' && window.ethereum
  ? custom(window.ethereum)
  : http()

const miniPayConfig = createConfig({
  chains: [celo],
  connectors: [injected()],
  transports: { [celo.id]: miniPayTransport },
})

const rainbowConfig = getDefaultConfig({
  appName: 'Blokaz',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '',
  chains: [celo],
  ssr: false,
})

export const config = IS_MINIPAY ? miniPayConfig : rainbowConfig

import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { celo } from 'wagmi/chains'
import { IS_MINIPAY } from '../utils/miniPay'

const miniPayConfig = createConfig({
  chains: [celo],
  connectors: [injected()],
  transports: { [celo.id]: http() },
})

const rainbowConfig = getDefaultConfig({
  appName: 'Blokaz',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '',
  chains: [celo],
  ssr: false,
})

export const config = IS_MINIPAY ? miniPayConfig : rainbowConfig

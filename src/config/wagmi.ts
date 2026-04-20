import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { celo } from 'wagmi/chains'

export const config = getDefaultConfig({
  appName: 'Blokaz',
  projectId: 'YOUR_PROJECT_ID', // Replace with your Project ID from cloud.walletconnect.com
  chains: [celo],
  ssr: false,
})

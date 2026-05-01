import { Web3Auth } from '@web3auth/modal'
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from '@web3auth/base'
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider'
import { Web3AuthConnector } from '@web3auth/web3auth-wagmi-connector'

// ─── Network selection ───────────────────────────────────────────────────────
// sapphire_mainnet → strict domain whitelist (add your origin in the dashboard)
// sapphire_devnet  → permissive, localhost allowed — use this during development
//
// Set VITE_WEB3AUTH_NETWORK=sapphire_devnet in .env for local dev.
// Set VITE_WEB3AUTH_NETWORK=sapphire_mainnet in production after whitelisting
// your domain at https://dashboard.web3auth.io → your project → Whitelist URLs.
const web3AuthNetwork =
  (import.meta.env.VITE_WEB3AUTH_NETWORK as string | undefined) === 'sapphire_mainnet'
    ? WEB3AUTH_NETWORK.SAPPHIRE_MAINNET
    : WEB3AUTH_NETWORK.SAPPHIRE_DEVNET

// Celo mainnet chain config — shared between the provider and the instance.
const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: '0xa4ec', // 42220 decimal
  rpcTarget: 'https://forno.celo.org',
  displayName: 'Celo Mainnet',
  blockExplorer: 'https://explorer.celo.org',
  ticker: 'CELO',
  tickerName: 'Celo',
}

// Web3Auth v9 requires chainConfig to go into EthereumPrivateKeyProvider,
// not directly into the Web3Auth constructor.
const privateKeyProvider = new EthereumPrivateKeyProvider({
  config: { chainConfig },
})

// Single shared instance — the connector calls initModal() lazily on first
// connect(), so there is no eager network request at module evaluation time.
export const web3auth = new Web3Auth({
  clientId: import.meta.env.VITE_WEB3AUTH_CLIENT_ID ?? '',
  web3AuthNetwork,
  privateKeyProvider,
  uiConfig: {
    appName: 'Blokaz',
    loginMethodsOrder: ['google', 'twitter', 'email_passwordless'],
    defaultLanguage: 'en',
    modalZIndex: '99998',
  },
})

// Standard wagmi v2 connector — drop-in alongside the injectedConnector.
// Clicking "SOCIAL" in the Header calls connect({ connector: web3AuthConnector })
// which opens the Web3Auth modal for provider selection.
export const web3AuthConnector = Web3AuthConnector({
  web3AuthInstance: web3auth,
})

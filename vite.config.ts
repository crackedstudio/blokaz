import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Required for @web3auth/modal and its dependencies which use Node.js
    // globals (Buffer, process, global) in the browser bundle.
    // protocolImports: false prevents the plugin from stubbing node: imports
    // that MetaMask/injected wallets also touch, avoiding the
    // "Cannot redefine property: ethereum" conflict.
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
      protocolImports: false,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    allowedHosts: [
      'aptly-letter-rocklike.ngrok-free.dev',
      'all'
    ],
  },
  // @ts-ignore - vitest types
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['contracts/**', 'node_modules/**'],
  },
})

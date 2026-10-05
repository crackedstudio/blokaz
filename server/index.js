import './env.js'
import { createApp } from './app.js'
import { account, publicClient, TOURNAMENT_ADDRESS } from './routes/sign.js'

const app = createApp()

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001
const server = app.listen(PORT, async () => {
  console.log(`Blokz server running on port ${PORT}`)
  console.log(`Signer address: ${account.address}`)
  console.log(`Tournament proxy: ${TOURNAMENT_ADDRESS}`)
  console.log(`RPC: ${process.env.RPC_URL}`)
  console.log(`Supabase: ${process.env.SUPABASE_URL ? 'connected' : 'NOT CONFIGURED'}`)

  try {
    const code = await publicClient.getBytecode({ address: TOURNAMENT_ADDRESS })
    console.log(code && code !== '0x' ? 'Contract bytecode verified OK' : 'WARNING: No contract code at TOURNAMENT_ADDRESS')
  } catch (err) {
    console.error('Failed to verify contract on startup:', err.message)
  }
})

function shutdown(signal) {
  console.log(`${signal} received — shutting down gracefully`)
  server.close(() => { console.log('Server closed'); process.exit(0) })
  setTimeout(() => process.exit(1), 10_000)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

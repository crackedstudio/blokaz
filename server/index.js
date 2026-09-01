import './env.js'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'

import { globalLimiter } from './middleware/rateLimits.js'
import signRouter, { account, publicClient, TOURNAMENT_ADDRESS } from './routes/sign.js'
import sessionRouter from './routes/session.js'
import tournamentSessionRouter from './routes/tournament-session.js'
import inventoryRouter from './routes/inventory.js'
import rewardsRouter from './routes/rewards.js'
import levelsRouter from './routes/levels.js'

const app = express()

// ── Request logging ──────────────────────────────────────────────────────────
app.use(morgan('dev'))

// ── Security headers ────────────────────────────────────────────────────────
app.use(helmet())

// Bypass localtunnel's interstitial warning page for API requests
app.use((_req, res, next) => {
  res.setHeader('Bypass-Tunnel-Reminder', 'true')
  next()
})

// ── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      cb(null, true)
    } else {
      cb(new Error(`CORS: origin ${origin} not allowed`))
    }
  },
  methods: ['GET', 'POST'],
  // x-admin-address carries the caller's wallet on /levels/admin/* and
  // /rewards/admin/*; without it here the browser's preflight blocks those.
  allowedHeaders: ['Content-Type', 'x-admin-address'],
}))

// ── Compression ──────────────────────────────────────────────────────────────
app.use(compression())

// ── Body parsing ─────────────────────────────────────────────────────────────
// /sign-submit carries the full move history: up to MAX_MOVES (5000) records
// at ~300 bytes of JSON each ≈ 1.6MB worst case, so 256kb rejected long games.
app.use(express.json({ limit: '2mb' }))

// ── Global rate limit ────────────────────────────────────────────────────────
app.use(globalLimiter)

// ── Request timeout ──────────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setTimeout(10_000, () => {
    res.status(503).json({ error: 'Request timeout' })
  })
  next()
})

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/', signRouter)
app.use('/session', sessionRouter)
app.use('/tournament-session', tournamentSessionRouter)
app.use('/inventory', inventoryRouter)
app.use('/rewards', rewardsRouter)
app.use('/levels', levelsRouter)

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message)
  // body-parser rejection — tell the client the real reason (413) instead of
  // a generic 500 so it doesn't retry an unretryable request
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' })
  }
  res.status(500).json({ error: 'Internal server error' })
})

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

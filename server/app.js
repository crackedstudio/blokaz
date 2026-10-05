import './env.js'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'

import { globalLimiter } from './middleware/rateLimits.js'

/**
 * Each router is imported on its first request, not at boot. Supabase starts a
 * fresh isolate for nearly every request, so whatever is imported up front is
 * paid on every call: loading viem alone costs ~200 ms there, and only signing
 * and purchases need it. A session sync now loads the session router and nothing
 * else.
 */
function lazy(load) {
  let router
  return async (req, res, next) => {
    router ??= (await load()).default
    router(req, res, next)
  }
}

/**
 * Builds the API app. Two hosts run it:
 *
 *   - Node (index.js): a long-lived process, so it owns compression, the
 *     in-memory rate limiter and the per-request timeout itself.
 *   - Supabase Edge Functions (supabase/functions/api): requests arrive under the
 *     function's name (/api/...), each isolate is short-lived, and the platform
 *     enforces its own time limit. An in-memory limiter there counts per isolate,
 *     not per client, so it is left off rather than trusted.
 *
 * @param {{ basePath?: string, edge?: boolean }} [options]
 */
export function createApp({ basePath = '/', edge = false } = {}) {
  const app = express()

  // ── Request logging ────────────────────────────────────────────────────────
  app.use(morgan('dev'))

  // ── Security headers ───────────────────────────────────────────────────────
  app.use(helmet())

  // Bypass localtunnel's interstitial warning page for API requests
  app.use((_req, res, next) => {
    res.setHeader('Bypass-Tunnel-Reminder', 'true')
    next()
  })

  // ── CORS ───────────────────────────────────────────────────────────────────
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

  // ── Compression ────────────────────────────────────────────────────────────
  if (!edge) app.use(compression())

  // ── Body parsing ───────────────────────────────────────────────────────────
  // /sign-submit carries the full move history: up to MAX_MOVES (5000) records
  // at ~300 bytes of JSON each ≈ 1.6MB worst case, so 256kb rejected long games.
  app.use(express.json({ limit: '2mb' }))

  if (!edge) {
    // ── Global rate limit ────────────────────────────────────────────────────
    app.use(globalLimiter)

    // ── Request timeout ──────────────────────────────────────────────────────
    app.use((_req, res, next) => {
      res.setTimeout(10_000, () => {
        res.status(503).json({ error: 'Request timeout' })
      })
      next()
    })
  }

  // ── Routes ─────────────────────────────────────────────────────────────────
  const api = express.Router()
  // post(), not use(): use() would strip the path the sign router matches on.
  api.post(['/sign-start', '/sign-submit'], lazy(() => import('./routes/sign.js')))
  api.use('/session', lazy(() => import('./routes/session.js')))
  api.use('/tournament-session', lazy(() => import('./routes/tournament-session.js')))
  api.use('/inventory', lazy(() => import('./routes/inventory.js')))
  api.use('/rewards', lazy(() => import('./routes/rewards.js')))
  api.use('/levels', lazy(() => import('./routes/levels.js')))

  // ── Health check ───────────────────────────────────────────────────────────
  api.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))

  app.use(basePath, api)

  // ── 404 ────────────────────────────────────────────────────────────────────
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

  // ── Global error handler ───────────────────────────────────────────────────
  app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err.message)
    // body-parser rejection — tell the client the real reason (413) instead of
    // a generic 500 so it doesn't retry an unretryable request
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large' })
    }
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}

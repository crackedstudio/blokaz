import '../env.js'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.warn('WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — session persistence disabled')
}

export const supabase = url && key
  ? createClient(url, key, {
      db: { schema: 'public' },
      global: {
        // Abort Supabase requests after 8 s so slow DB queries
        // don't hold up the Express request beyond our 10 s server timeout.
        fetch: (url, options = {}) => {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 8_000)
          return fetch(url, { ...options, signal: controller.signal })
            .finally(() => clearTimeout(timer))
        },
      },
    })
  : null

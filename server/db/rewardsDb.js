import '../env.js'
import { createClient } from '@supabase/supabase-js'

// The rewards table lives in its OWN Supabase project, separate from the one
// holding sessions and inventory (see db/supabase.js). The frontend reaches it
// with the anon key via src/lib/rewardsDb.ts; the server needs its own
// service-role client to write cash-link payouts for cleared milestones.
const url = process.env.REWARDS_SUPABASE_URL
const key = process.env.REWARDS_SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.warn(
    'WARNING: REWARDS_SUPABASE_URL or REWARDS_SUPABASE_SERVICE_ROLE_KEY not set — ' +
      'level cash-link milestones will be recorded as pending instead of paid'
  )
}

export const rewardsDb =
  url && key
    ? createClient(url, key, {
        db: { schema: 'public' },
        global: {
          fetch: (fetchUrl, options = {}) => {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 8_000)
            return fetch(fetchUrl, { ...options, signal: controller.signal }).finally(() =>
              clearTimeout(timer)
            )
          },
        },
      })
    : null

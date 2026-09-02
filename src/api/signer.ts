import { CURRENT_RULES_VERSION } from '../engine/rules'
import type { RulesVersion } from '../engine/rules'

const SIGNER_API_BASE =
  (import.meta.env.VITE_SIGNER_URL as string | undefined) ?? 'http://localhost:3001'

// The server understood the request and refused it (4xx) — retrying the same
// payload cannot succeed. Carries the server's reason so the UI can show it
// instead of a misleading "could not reach server".
export class SignerRejectionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'SignerRejectionError'
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data?.error === 'string') return data.error
  } catch {
    // body wasn't JSON
  }
  return `Signing server error (HTTP ${res.status})`
}

// Retry up to `attempts` times. A cold-started Render server can take
// 30–60s to wake, so the total window (attempts × 20s timeout + 2s waits)
// must comfortably exceed that — 3 attempts (~64s) was too tight.
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  attempts = 5
): Promise<Response> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) })
      if (res.ok) return res
      // 4xx = deliberate rejection, not a server fault — never retry
      if (res.status >= 400 && res.status < 500) {
        throw new SignerRejectionError(await readErrorMessage(res), res.status)
      }
      lastErr = new Error(`Signing server error (HTTP ${res.status})`)
    } catch (err) {
      if (err instanceof SignerRejectionError) throw err
      lastErr = err
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
  throw lastErr ?? new Error('Server unreachable after retries')
}

export async function requestStartSignature(
  tid: bigint,
  seedHash: `0x${string}`,
  player: `0x${string}`
) {
  const res = await fetchWithRetry(`${SIGNER_API_BASE}/sign-start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tid: tid.toString(), seedHash, player }),
  })

  const data = await res.json()
  return {
    signature: data.signature as `0x${string}`,
    nonce: BigInt(data.nonce),
    deadline: BigInt(data.deadline),
  }
}

export async function requestSubmitSignature(
  tid: bigint,
  gid: bigint,
  score: number,
  moves: any[],
  seed: `0x${string}`,
  player: `0x${string}`,
  /**
   * Ruleset this run was played under. The server replays against it, so a run
   * started before a rules change still validates. Omitting it means v1.
   */
  rulesVersion: RulesVersion = CURRENT_RULES_VERSION
) {
  const res = await fetchWithRetry(`${SIGNER_API_BASE}/sign-submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tid: tid.toString(),
      gid: gid.toString(),
      score,
      moves,
      seed,
      player,
      rulesVersion,
    }),
  })

  const data = await res.json()
  return {
    signature: data.signature as `0x${string}`,
    deadline: BigInt(data.deadline),
  }
}

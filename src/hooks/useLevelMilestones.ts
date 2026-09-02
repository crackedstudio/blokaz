import { useCallback, useEffect, useState } from 'react'

const SERVER_URL =
  (import.meta.env.VITE_SIGNER_URL as string | undefined) ??
  'http://localhost:3001'

/** A player who reached a cash milestone (level 4, 8 or 12). */
export interface MilestoneGrant {
  id: string
  address: string
  level: number
  /** Badge name for the level, e.g. PIXEL BREAKER. */
  name: string
  granted_at: string
  cash_pending: boolean
  cash_reward_id: string | null
}

export interface MilestoneData {
  /** Owed a payout — oldest first, the queue to work through. */
  pending: MilestoneGrant[]
  /** Already rewarded — newest first. */
  paid: MilestoneGrant[]
  /** Unassigned links left in the pool, keyed by level. */
  available: Record<string, number>
}

const EMPTY: MilestoneData = { pending: [], paid: [], available: {} }

function adminHeaders(adminAddress: string, json = false): HeadersInit {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    // Checked server-side against ADMIN_ADDRESSES; the header is allow-listed
    // in the server's CORS config so the browser preflight lets it through.
    'x-admin-address': adminAddress.toLowerCase(),
  }
}

/**
 * Reads the cash-milestone ledger for the admin portal: who reached level 4, 8
 * or 12, who is still owed a payout, and how many funded links remain.
 */
export function useLevelMilestones(adminAddress?: string) {
  const [data, setData] = useState<MilestoneData>(EMPTY)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!adminAddress) {
      setData(EMPTY)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`${SERVER_URL}/levels/admin/pending`, {
        headers: adminHeaders(adminAddress),
      })
      if (!res.ok) {
        setError(
          res.status === 401
            ? 'Not authorised — add this wallet to ADMIN_ADDRESSES on the server.'
            : `Server error (HTTP ${res.status})`
        )
        return
      }
      const json = await res.json()
      setData({
        pending: json.pending ?? [],
        paid: json.paid ?? [],
        available: json.available ?? {},
      })
    } catch {
      setError('Could not reach the server.')
    } finally {
      setIsLoading(false)
    }
  }, [adminAddress])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

/** Settles one owed milestone by issuing a cash link to that player. */
export async function fulfilMilestone(
  adminAddress: string,
  grantId: string,
  cashLinkUrl: string,
  amount: string,
  token: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${SERVER_URL}/levels/admin/fulfil`, {
      method: 'POST',
      headers: adminHeaders(adminAddress, true),
      body: JSON.stringify({ grantId, cashLinkUrl, amount, token }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok)
      return { ok: false, error: json?.error ?? `HTTP ${res.status}` }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not reach the server.' }
  }
}

/** Loads pre-funded cash links into the pool for a milestone level. */
export async function loadMilestonePool(
  adminAddress: string,
  level: number,
  links: { cashLinkUrl: string; amount: string; token: string }[]
): Promise<{ ok: boolean; added?: number; error?: string }> {
  try {
    const res = await fetch(`${SERVER_URL}/levels/admin/pool`, {
      method: 'POST',
      headers: adminHeaders(adminAddress, true),
      body: JSON.stringify({ level, links }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok)
      return { ok: false, error: json?.error ?? `HTTP ${res.status}` }
    return { ok: true, added: json.added }
  } catch {
    return { ok: false, error: 'Could not reach the server.' }
  }
}

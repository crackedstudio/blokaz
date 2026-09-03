import { getRewardUrl, type Reward } from '../hooks/useRewards'

/**
 * Step one of a cash-link claim, shared by every surface that offers one.
 *
 * Claiming is two steps by necessity: the link is an external page, so the app
 * hands the player over to it and only marks the reward claimed once they come
 * back and confirm they got the money. What survives that round trip is this
 * localStorage record — without it, a player who navigates away has no way to
 * be asked, and the reward is either lost or marked claimed on nothing more
 * than an outbound click.
 *
 * PlayerRewardsPanel owns step two. It is mounted in the lobby, which is where
 * the player lands on return, and it picks the pending claim up from storage on
 * mount and on every visibility change — so a claim started anywhere (the level
 * card, the ladder, the rewards sheet) is confirmed in exactly one place.
 */
export interface PendingClaim {
  rewardId: string
  cashLinkUrl: string
  label: string
  amount: string
  token: string
}

export function pendingStorageKey(address: string) {
  return `blokaz_pending_claim_${address.toLowerCase()}`
}

export function loadPendingClaim(address: string): PendingClaim | null {
  try {
    return JSON.parse(localStorage.getItem(pendingStorageKey(address)) ?? 'null')
  } catch {
    return null
  }
}

export function savePendingClaim(address: string, pending: PendingClaim | null) {
  if (pending) localStorage.setItem(pendingStorageKey(address), JSON.stringify(pending))
  else localStorage.removeItem(pendingStorageKey(address))
}

/**
 * Fetches the cash link, records the claim as pending, and sends the player to
 * it. Deliberately does NOT mark the reward claimed — that only happens after
 * they confirm they received it.
 *
 * Returns the pending record so the caller can reflect it in its own state; on
 * success the browser is already navigating away.
 */
export async function startRewardClaim(
  address: string,
  reward: Pick<Reward, 'id' | 'label' | 'amount' | 'token'>
): Promise<{ ok: true; pending: PendingClaim } | { ok: false; error: string }> {
  const result = await getRewardUrl(address, reward.id)
  if (!result.ok || !result.cashLinkUrl) {
    return { ok: false, error: result.error ?? 'Failed to get reward' }
  }

  const pending: PendingClaim = {
    rewardId: reward.id,
    cashLinkUrl: result.cashLinkUrl,
    label: reward.label,
    amount: reward.amount,
    token: reward.token,
  }
  savePendingClaim(address, pending)
  window.location.href = result.cashLinkUrl
  return { ok: true, pending }
}

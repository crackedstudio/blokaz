import { getRewardUrl, confirmRewardClaimed, type Reward } from '../hooks/useRewards'

/**
 * Claiming a cash link, shared by every surface that offers one.
 *
 * The reward is marked claimed when the link is handed over, not when the
 * player comes back and says they got it. Waiting for that answer meant a
 * player who claimed and never returned to the lobby — or who dismissed the
 * prompt — kept being offered a CLAIM button for money they already had.
 *
 * Marking early costs nothing, because the flag has never been what gates
 * access to the money: the link itself is, and it is kept in localStorage and
 * listed under Settings → Rewards so it can be reopened afterwards. That is
 * what the confirmation modal's own safety note has always promised.
 *
 * The pending record below still survives the trip so the player can be asked
 * whether the money arrived, and offered the link again if it did not.
 * PlayerRewardsPanel owns that prompt — it is mounted in the lobby, which is
 * where the player lands on return, so a claim begun anywhere (the level card,
 * the ladder, the rewards sheet) is followed up in exactly one place.
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

// ── Claimed links, kept so a claimed reward can still be opened ──────────────

export interface ClaimedEntry {
  cashLinkUrl: string
  label: string
  amount: string
  token: string
}

export function claimedStorageKey(address: string) {
  return `blokaz_claimed_${address.toLowerCase()}`
}

export function loadClaimedLinks(address: string): Record<string, ClaimedEntry> {
  try {
    return JSON.parse(localStorage.getItem(claimedStorageKey(address)) ?? '{}')
  } catch {
    return {}
  }
}

export function saveClaimedLinks(
  address: string,
  claimed: Record<string, ClaimedEntry>
) {
  localStorage.setItem(claimedStorageKey(address), JSON.stringify(claimed))
}

/**
 * Fetches the cash link, marks the reward claimed, keeps the link locally, and
 * sends the player to it.
 *
 * The database write is not allowed to hold up the hand-over: if it fails the
 * player still goes to their money, and the confirmation prompt on their return
 * marks it then. That retry is why the pending record is written either way.
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

  // Keep the link before anything can go wrong with the write — this is what
  // makes a claimed reward reopenable, so marking it claimed takes nothing away.
  saveClaimedLinks(address, {
    ...loadClaimedLinks(address),
    [reward.id]: {
      cashLinkUrl: result.cashLinkUrl,
      label: reward.label,
      amount: reward.amount,
      token: reward.token,
    },
  })

  const marked = await confirmRewardClaimed(address, reward.id)
  if (!marked.ok) console.error('reward claim not recorded:', marked.error)

  window.location.href = result.cashLinkUrl
  return { ok: true, pending }
}

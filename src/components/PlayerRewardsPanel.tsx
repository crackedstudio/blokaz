import React, { useState, useEffect, useCallback } from 'react'
import { usePlayerRewards, confirmRewardClaimed, type Reward } from '../hooks/useRewards'
import RewardsClaimModal from './RewardsClaimModal'
import RewardsMiniBar from './RewardsMiniBar'
import RewardsConfirmModal from './RewardsConfirmModal'
// Step one of a claim, and the record that survives the trip to the cash link.
// Shared so a claim started on a level card is confirmed by this panel too.
import {
  loadPendingClaim,
  savePendingClaim,
  startRewardClaim,
  type PendingClaim,
} from '../lib/rewardClaim'

interface ClaimedEntry {
  cashLinkUrl: string
  label: string
  amount: string
  token: string
}

function claimedStorageKey(address: string) {
  return `blokaz_claimed_${address.toLowerCase()}`
}

function loadClaimed(address: string): Record<string, ClaimedEntry> {
  try { return JSON.parse(localStorage.getItem(claimedStorageKey(address)) ?? '{}') }
  catch { return {} }
}

function saveClaimed(address: string, claimed: Record<string, ClaimedEntry>) {
  localStorage.setItem(claimedStorageKey(address), JSON.stringify(claimed))
}

interface Props {
  address: string
}

const PlayerRewardsPanel: React.FC<Props> = ({ address }) => {
  const { rewards, isLoading, refetch } = usePlayerRewards(address)
  const [modalOpen, setModalOpen]         = useState(false)
  const [miniDismissed, setMiniDismissed] = useState(false)
  const [claiming, setClaiming]           = useState<string | null>(null)
  const [claimedLinks, setClaimedLinks]   = useState<Record<string, ClaimedEntry>>({})
  const [claimError, setClaimError]       = useState<string | null>(null)

  // Confirm-on-return state
  const [pendingClaim, setPendingClaim]   = useState<PendingClaim | null>(null)
  const [showConfirm, setShowConfirm]     = useState(false)
  const [isConfirming, setIsConfirming]   = useState(false)

  // Load persisted state on mount
  useEffect(() => {
    setClaimedLinks(loadClaimed(address))
    const pending = loadPendingClaim(address)
    if (pending) {
      setPendingClaim(pending)
      setShowConfirm(true)
    }
  }, [address])

  // Also check for pending claim when app regains focus (after returning from cash link)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        const pending = loadPendingClaim(address)
        if (pending && !showConfirm) {
          setPendingClaim(pending)
          setShowConfirm(true)
        }
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
    }
  }, [address, showConfirm])

  const unclaimed = rewards.filter(r => !r.claimed_at && !claimedLinks[r.id])

  // Auto-open modal when unclaimed rewards detected
  useEffect(() => {
    if (!isLoading && unclaimed.length > 0 && !showConfirm) {
      setModalOpen(true)
      setMiniDismissed(false)
    }
  }, [isLoading, unclaimed.length, showConfirm])

  // Step 1: fetch URL and navigate — do NOT mark as claimed yet
  const handleClaim = async (reward: Reward) => {
    setClaiming(reward.id)
    setClaimError(null)
    const result = await startRewardClaim(address, reward)
    setClaiming(null)
    if (result.ok) setPendingClaim(result.pending)
    else setClaimError(result.error)
  }

  // Step 2a: user confirms they received the reward → mark as claimed
  const handleConfirm = async () => {
    if (!pendingClaim) return
    setIsConfirming(true)
    const result = await confirmRewardClaimed(address, pendingClaim.rewardId)
    setIsConfirming(false)
    if (result.ok) {
      const entry: ClaimedEntry = {
        cashLinkUrl: pendingClaim.cashLinkUrl,
        label: pendingClaim.label,
        amount: pendingClaim.amount,
        token: pendingClaim.token,
      }
      const updated = { ...claimedLinks, [pendingClaim.rewardId]: entry }
      setClaimedLinks(updated)
      saveClaimed(address, updated)
      savePendingClaim(address, null)
      setPendingClaim(null)
      setShowConfirm(false)
      refetch()
    } else {
      setClaimError(result.error ?? 'Failed to confirm')
      setShowConfirm(false)
    }
  }

  // Step 2b: user did not receive it → keep unclaimed, let them try again
  const handleNotYet = () => {
    savePendingClaim(address, null)
    setPendingClaim(null)
    setShowConfirm(false)
    setModalOpen(true)
  }

  const handleModalClose = () => {
    setModalOpen(false)
    setClaimError(null)
  }

  if (isLoading) return null
  if (unclaimed.length === 0 && !showConfirm) return null

  return (
    <>
      {/* Step 2 confirmation — shown when user returns from cash link */}
      {showConfirm && pendingClaim && (
        <RewardsConfirmModal
          label={pendingClaim.label}
          amount={pendingClaim.amount}
          token={pendingClaim.token}
          onConfirm={handleConfirm}
          onNotYet={handleNotYet}
          isConfirming={isConfirming}
        />
      )}

      {/* Main claim modal */}
      {!showConfirm && modalOpen && unclaimed.length > 0 && (
        <RewardsClaimModal
          rewards={unclaimed}
          claiming={claiming}
          claimedLinks={claimedLinks}
          claimError={claimError}
          onClaim={handleClaim}
          onClose={handleModalClose}
        />
      )}

      {/* Mini bar reminder */}
      {!showConfirm && !modalOpen && !miniDismissed && unclaimed.length > 0 && (
        <RewardsMiniBar
          count={unclaimed.length}
          onOpen={() => setModalOpen(true)}
          onDismiss={() => setMiniDismissed(true)}
        />
      )}
    </>
  )
}

export default PlayerRewardsPanel

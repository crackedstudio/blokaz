import React, { useEffect, useMemo, useRef } from 'react'
import { useGameStore } from '../stores/gameStore'
import { usePowerUpStore } from '../stores/powerUpStore'
import { useMetaStore } from '../stores/metaStore'
import { summarizeRun } from '../engine/meta'
import { useStablecoinRevive } from '../hooks/useStablecoinRevive'
import {
  STABLECOIN_TOKENS,
  type StablecoinSymbol,
} from '../constants/contracts'
import { packMoves } from '../engine/replay'
import { getComboMultiplier } from '../engine/scoring'
import {
  useSubmitScore,
  useActiveGame,
  useActiveTournamentGame,
  useLeaderboard,
  useSubmitTournamentScore,
  useStartGame,
  useStartTournamentGame,
} from '../hooks/useBlokzGame'
import { useAccount, useReadContract } from 'wagmi'
import { BLOKZ_GAME_ABI, BLOKZ_TOURNAMENT_ABI } from '../constants/abi'
import contractInfo from '../contract.json'
import { requestSubmitSignature, requestStartSignature, SignerRejectionError } from '../api/signer'
import { markSessionComplete, markTournamentSessionComplete, fetchServerSession, fetchTournamentServerSession } from '../hooks/useMoveSync'
import { keccak256, encodePacked } from 'viem'
import {
  CLASSIC_SESSION_STORAGE_KEY,
  tournamentSessionKey,
  readTournamentSession,
  clearStoredGameSession,
  readStoredGameSession,
  recordSubmittedSeeds,
} from '../utils/gameSessionStorage'
import { BrutalIcon } from './BrutalIcon'
import { IS_MINIPAY } from '../utils/miniPay'

const MINIPAY_DEPOSIT_URL = 'https://minipay.opera.com/add_cash'

const GAME_ADDRESS = contractInfo.game as `0x${string}`
const TOURNAMENT_ADDRESS = contractInfo.tournament as `0x${string}`

interface GameOverModalProps {
  score: number
  onPlayAgain: () => void
  onBack?: () => void
  mode: 'classic' | 'tournament'
  onOpenLeaderboard?: () => void
}

const EMPTY_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

const GameOverModal: React.FC<GameOverModalProps> = ({
  score,
  onPlayAgain,
  onBack,
  mode,
  onOpenLeaderboard,
}) => {
  const { address } = useAccount()

  // ── Meta-progression: fold the finished run into level / missions / achievements.
  //
  // Recorded on unmount rather than on mount, because a revive re-opens this
  // modal later with a longer run. The captured session is the same JS object
  // throughout, so `isGameOver` tells the two cases apart: a revive clears it
  // (skip — the run continues and will be recorded when it really ends), while
  // Play Again / Back leave it set on the old session even after the store has
  // moved on to a new one. Net effect: exactly one record per run, with final
  // post-revive numbers. Purely local — no chain or signer involvement.
  const metaSessionRef = useRef(useGameStore.getState().gameSession)
  useEffect(() => {
    const session = metaSessionRef.current
    if (!session) return
    return () => {
      if (!session.isGameOver) return
      useMetaStore.getState().recordRun(summarizeRun(session.moveHistory, session.score))
    }
  }, [])

  // Each contract tracks its own activeGame mapping — use the right one per mode
  const {
    gameId: classicActiveGameId,
    isLoading: isLoadingClassicGameId,
    refetch: refetchClassicGameId,
  } = useActiveGame(mode === 'classic' ? address : undefined)
  const {
    gameId: tournamentActiveGameId,
    isLoading: isLoadingTournamentGameId,
    refetch: refetchTournamentGameId,
  } = useActiveTournamentGame(mode === 'tournament' ? address : undefined)
  const activeGameId =
    mode === 'tournament' ? tournamentActiveGameId : classicActiveGameId
  const isLoadingGameId =
    mode === 'tournament' ? isLoadingTournamentGameId : isLoadingClassicGameId
  const { leaderboard } = useLeaderboard()
  const {
    gameSession,
    onChainSeed,
    onChainGameId,
    onChainStatus,
    forceReset,
    tournamentId,
    setTournamentId,
    comboStreak,
    reviveGame,
  } = useGameStore()

  const {
    balances: stableBalances,
    canAfford,
    hasAnyBalance: hasStableBalance,
    defaultToken,
    isPaying: isStablePaying,
    error: stableError,
    payForRevive,
    getReviveCost,
    reviveCount,
  } = useStablecoinRevive()

  const [selectedToken, setSelectedToken] =
    React.useState<StablecoinSymbol>(defaultToken)

  const { inventory, consumeCharge } = usePowerUpStore()
  const bundleCredits = inventory.revivalBundle

  // Synchronous mutual-exclusion guard — prevents both revival paths from
  // firing before React can disable the buttons via a re-render. A ref is
  // used so the guard is set immediately (no batching delay).
  const isRevivingRef = React.useRef(false)
  const [isReviving, setIsReviving] = React.useState(false)

  const handleBundleRevive = () => {
    // Never revive while a score submission is in flight — the submission
    // marks the on-chain game SUBMITTED, so a run continued after it can
    // never be submitted and the revive would be wasted.
    if (isRevivingRef.current || isRegistering) return
    isRevivingRef.current = true
    setIsReviving(true)
    setCountdown(null)
    autoSubmitTriggeredRef.current = true
    if (consumeCharge('revivalBundle')) {
      reviveGame()
      // revive() deals a fresh trio without clearing the board — if none of
      // the new pieces fit, the game is immediately over again and the modal
      // stays mounted. Release the lock so the buttons aren't stuck disabled.
      if (useGameStore.getState().isGameOver) {
        isRevivingRef.current = false
        setIsReviving(false)
      }
    } else {
      // No credits left — release the lock so the player can try another path
      isRevivingRef.current = false
      setIsReviving(false)
    }
  }

  const handleStableRevive = async () => {
    // Same guard as handleBundleRevive: paying to continue a run whose score
    // is being submitted would burn the payment on an unsubmittable game.
    if (isRevivingRef.current || isRegistering) return
    isRevivingRef.current = true
    setIsReviving(true)
    setCountdown(null)
    autoSubmitTriggeredRef.current = true
    const success = await payForRevive(selectedToken)
    // Release on payment failure, or when the revive dealt an unplayable trio
    // and the game is immediately over again (modal stays mounted either way).
    if (!success || useGameStore.getState().isGameOver) {
      isRevivingRef.current = false
      setIsReviving(false)
    }
  }

  const [showShareSheet, setShowShareSheet] = React.useState(false)
  const [countdown, setCountdown] = React.useState<number | null>(null)
  const [signerError, setSignerError] = React.useState<string | null>(null)
  const autoSubmitTriggeredRef = React.useRef(false)

  const {
    startGame: contractStartGame,
    isPending: isRegisterPending,
    isConfirming: isRegisterConfirming,
    isSuccess: isRegisterSuccess,
  } = useStartGame()

  const { submitScore, isPending, isConfirming, isSuccess, error } =
    useSubmitScore()
  const {
    submitTournamentScore,
    isPending: isToursPending,
    isConfirming: isToursConfirming,
    isSuccess: isToursSuccess,
    error: toursError,
  } = useSubmitTournamentScore()
  // Tournament sessions are stored per-tournament so concurrent tournaments
  // can't clobber each other.
  const storageKey =
    mode === 'tournament' && tournamentId !== null
      ? tournamentSessionKey(tournamentId)
      : CLASSIC_SESSION_STORAGE_KEY
  const isTournamentMode = mode === 'tournament' && tournamentId !== null

  // The contract's activeGame mapping is one-per-player: with two concurrent
  // tournaments it points at whichever game started last, which may belong to
  // the OTHER tournament. For tournament submissions, fall back to this
  // tournament's stored game ID instead; the global mapping is classic-only.
  const storedTournamentGameId = useMemo(() => {
    if (!isTournamentMode || !address) return null
    const gid = readTournamentSession(tournamentId!, address, TOURNAMENT_ADDRESS)?.gameId
    return gid ? BigInt(gid) : null
  }, [isTournamentMode, tournamentId, address])
  const effectiveGameId =
    mode === 'tournament'
      ? onChainGameId || storedTournamentGameId || undefined
      : onChainGameId || activeGameId

  // Classic games live in GAME_ADDRESS; tournament games in TOURNAMENT_ADDRESS.
  // Both hooks are always called (Rules of Hooks), but only the relevant one is enabled.
  const { data: classicGameData, isLoading: isLoadingClassicContract } =
    useReadContract({
      address: GAME_ADDRESS,
      abi: BLOKZ_GAME_ABI,
      functionName: 'games',
      args: effectiveGameId ? [effectiveGameId] : undefined,
      query: { enabled: mode === 'classic' && !!effectiveGameId },
    })
  const { data: tournamentGameData, isLoading: isLoadingTournamentContract } =
    useReadContract({
      address: TOURNAMENT_ADDRESS,
      abi: BLOKZ_TOURNAMENT_ABI,
      functionName: 'games',
      args: effectiveGameId ? [effectiveGameId] : undefined,
      query: { enabled: mode === 'tournament' && !!effectiveGameId },
    })
  const gameData = mode === 'tournament' ? tournamentGameData : classicGameData
  const isLoadingContract =
    mode === 'tournament'
      ? isLoadingTournamentContract
      : isLoadingClassicContract

  // Last-resort seed recovery. A run that was synced to the server but whose
  // on-chain start never confirmed keeps its raw seed only in the server
  // session; if this device also lost its localStorage copy, the store holds no
  // seed and the run can be neither registered nor submitted ("Game seed
  // unavailable"). Pull the seed back from the correct server session (classic
  // or per-tournament) so the Register → submit flow can complete and the score
  // isn't stranded.
  const [serverSeed, setServerSeed] = React.useState<`0x${string}` | null>(null)
  React.useEffect(() => {
    if (!address) return
    if (onChainSeed) return
    // Tournament restore is keyed by tournamentId — wait until we have one.
    if (mode === 'tournament' && tournamentId === null) return
    const contractAddr = mode === 'tournament' ? TOURNAMENT_ADDRESS : GAME_ADDRESS
    if (readStoredGameSession(storageKey, address, contractAddr)?.seed) return
    let cancelled = false
    const request = mode === 'tournament'
      ? fetchTournamentServerSession(address, tournamentId!.toString())
      : fetchServerSession(address)
    request.then((s) => {
      const seed = s?.onChainSeed
      if (!cancelled && typeof seed === 'string' && /^0x[0-9a-fA-F]{64}$/.test(seed)) {
        setServerSeed(seed as `0x${string}`)
        // Mirror into the store so the rest of the submit flow (and any
        // re-mount) sees it without re-fetching.
        useGameStore.setState({ onChainSeed: seed as `0x${string}` })
      }
    })
    return () => { cancelled = true }
  }, [mode, tournamentId, address, onChainSeed, storageKey])

  const recoveredSeed = useMemo(() => {
    if (onChainSeed) return onChainSeed
    if (!address) return null
    const contractAddr =
      mode === 'tournament' ? TOURNAMENT_ADDRESS : GAME_ADDRESS
    return (
      readStoredGameSession(storageKey, address, contractAddr)?.seed ?? serverSeed ?? null
    )
  }, [address, onChainSeed, storageKey, mode, serverSeed])

  const onChainHash = useMemo(() => {
    if (!gameData) return null
    const txData = gameData as { seedHash?: `0x${string}` } & readonly unknown[]
    // Named field works for both contracts; index fallback differs:
    // classic struct: [player, seedHash, ...] → index 1
    // tournament struct: [player, tournamentId, seedHash, ...] → index 2
    const indexFallback = mode === 'tournament' ? txData[2] : txData[1]
    return (txData.seedHash ?? indexFallback ?? null) as `0x${string}` | null
  }, [gameData, mode])

  const isSeedMatch = useMemo(() => {
    if (!recoveredSeed || !address) return false
    if (!gameData) return false
    const expectedHash = keccak256(
      encodePacked(['bytes32', 'address'], [recoveredSeed, address])
    )
    if (!onChainHash) return false
    console.log('--- Submission Pre-flight Check ---')
    console.log('Match Result:', expectedHash === onChainHash)
    return expectedHash === onChainHash
  }, [recoveredSeed, address, effectiveGameId, gameData, onChainHash])

  // Classic game struct: [player, seedHash, score, startedAt, submittedAt, status]
  // status: 0 = ACTIVE, 1 = SUBMITTED, 2 = REJECTED
  const classicGameStatus = useMemo(() => {
    if (mode !== 'classic' || !gameData) return null
    const g = gameData as { status?: number } & readonly unknown[]
    return Number(g.status ?? g[5] ?? 0)
  }, [gameData, mode])

  const isLoading = isLoadingGameId || isLoadingContract

  const resetForNextGame = () => {
    const activeTournamentId = tournamentId
    clearStoredGameSession(storageKey)
    forceReset()
    if (mode === 'tournament' && activeTournamentId !== null)
      setTournamentId(activeTournamentId)
  }

  const handleAbandon = () => {
    resetForNextGame()
    onPlayAgain()
  }

  // Submit signature prefetched as soon as the modal has everything it needs,
  // so the submit itself is a single wallet action with no signer round-trip
  // on the critical path — and signer problems surface early, while the
  // auto-retry below still has time to recover them.
  const prefetchedSubmitSigRef = React.useRef<{
    gid: string
    score: number
    signature: `0x${string}`
    deadline: bigint
  } | null>(null)

  const handleSubmit = async () => {
    if (!gameSession || !recoveredSeed || !effectiveGameId) return
    if (isRegistering || isAllSuccess) return
    // Filter out marker records (revive, bomb, lottery) — they have pieceIndex: -1.
    // Packing a negative pieceIndex produces a negative BigInt which corrupts the
    // packed word and causes the ABI encoder to throw before the tx is sent.
    const realMoves = gameSession.moveHistory.filter(m => m.pieceIndex >= 0)
    const packed = packMoves(realMoves)
    if (isTournamentMode) {
      setSignerError(null)
      try {
        const nowSec = BigInt(Math.floor(Date.now() / 1000))
        const prefetch = prefetchedSubmitSigRef.current
        const usable =
          prefetch &&
          prefetch.gid === effectiveGameId.toString() &&
          prefetch.score === gameSession.score &&
          prefetch.deadline > nowSec + 60n
        const { signature, deadline } = usable
          ? prefetch
          : await requestSubmitSignature(
              tournamentId!,
              effectiveGameId!,
              gameSession.score,
              gameSession.moveHistory,
              recoveredSeed,
              address!,
              gameSession.rulesVersion
            )
        submitTournamentScore(
          tournamentId!,
          effectiveGameId!,
          gameSession.score,
          deadline,
          signature
        )
      } catch (err) {
        console.error('Failed to get submission signature:', err)
        setSignerError(
          err instanceof SignerRejectionError
            ? `Submission rejected: ${err.message}`
            : 'Could not reach signing server — tap retry to try again.'
        )
      }
    } else {
      submitScore(
        effectiveGameId,
        recoveredSeed,
        packed,
        gameSession.score,
        realMoves.length
      )
    }
  }

  const isRegistering =
    isPending || isConfirming || isToursPending || isToursConfirming
  const isSyncing = onChainStatus === 'pending' || onChainStatus === 'syncing'
  const isAllSuccess = isSuccess || isToursSuccess
  const hasError = error || toursError
  // A stored classic game the contract can never accept this run against:
  // already SUBMITTED/REJECTED, or its seed commitment belongs to a different
  // run (stale gameId carried over from a previous session via restore).
  // Submitting against it reverts forever — the recovery is re-registering
  // the same seed as a fresh game below.
  const isStaleClassicGame =
    mode === 'classic' &&
    !!effectiveGameId &&
    !!gameData &&
    !!recoveredSeed &&
    !isAllSuccess &&
    (classicGameStatus !== 0 || !isSeedMatch)
  // Button is enabled as soon as we have a game ID — seed verification is
  // enforced by the contract. On MiniPay wagmi's isSuccess may never fire,
  // so we don't gate on isSeedMatch or onChainStatus here.
  const canSubmit =
    !isRegistering &&
    !isAllSuccess &&
    !!gameSession &&
    !!recoveredSeed &&
    !!effectiveGameId &&
    !isStaleClassicGame

  // Human-readable reason when the submit button is blocked
  const submitBlockReason: string | null = (() => {
    if (isAllSuccess || isRegistering) return null
    if (!gameSession) return 'Game session not found — start a new game'
    if (!effectiveGameId) return null // handled by the register button below
    if (!recoveredSeed) return 'Game seed unavailable — start a new game'
    return null
  })()

  // Tournament late-registration: when the start tx silently failed, the run
  // has no on-chain game and the score can't be submitted. Re-committing the
  // SAME seed via a fresh startTournamentGame creates a new game ID whose
  // seedHash matches the recorded run, so the existing history validates and
  // submits against it — the score is fully recoverable.
  const {
    startTournamentGame: contractStartTournamentGame,
    isPending: isTourRegPending,
    isConfirming: isTourRegConfirming,
    isSuccess: isTourRegSuccess,
    error: tourRegError,
  } = useStartTournamentGame()
  const [isPollingGameId, setIsPollingGameId] = React.useState(false)
  // Game id in place when registration was requested — the poll below adopts
  // only a DIFFERENT id, so a stale classic game can't be re-adopted as "new".
  const prevGameIdRef = React.useRef<bigint>(0n)

  // True when the game was never registered on-chain, or its stored game id
  // is unusable (stale classic game) — show a Register button so the player
  // can fix it without leaving the game-over screen.
  const needsRegistration =
    (!effectiveGameId || isStaleClassicGame) &&
    !!recoveredSeed && !!gameSession && !isLoadingGameId &&
    (mode === 'classic' || isTournamentMode)
  const isRegistering2 =
    isRegisterPending || isRegisterConfirming ||
    isTourRegPending || isTourRegConfirming || isPollingGameId

  const handleRegisterGame = async () => {
    if (!recoveredSeed || !address) return
    prevGameIdRef.current = effectiveGameId ?? 0n
    if (isTournamentMode && tournamentId !== null) {
      setSignerError(null)
      try {
        const seedHash = keccak256(
          encodePacked(['bytes32', 'address'], [recoveredSeed as `0x${string}`, address])
        )
        const { signature, nonce, deadline } = await requestStartSignature(
          tournamentId,
          seedHash,
          address
        )
        contractStartTournamentGame(tournamentId, seedHash, nonce, deadline, signature)
        // Poll for the new game ID regardless of wagmi's isSuccess — MiniPay's
        // provider may never emit it (same limitation as the match screen).
        setIsPollingGameId(true)
      } catch (err) {
        console.error('Failed to get registration signature:', err)
        setSignerError(
          err instanceof SignerRejectionError
            ? `Registration rejected: ${err.message}`
            : 'Could not reach signing server — tap register to try again.'
        )
      }
    } else {
      // The contract stores keccak256(seed ++ player) as the seedHash and
      // submitScore re-derives it from the raw seed — committing the raw seed
      // here would make the new game just as unsubmittable as the old one.
      const seedHash = keccak256(
        encodePacked(
          ['bytes32', 'address'],
          [recoveredSeed as `0x${string}`, address]
        )
      )
      contractStartGame(seedHash)
      setIsPollingGameId(true)
    }
  }

  // Poll the contract until the re-registered tournament game ID appears, then
  // adopt it into the store and this tournament's storage slot so
  // effectiveGameId unlocks the submit button (and its auto-countdown).
  // Safe to trust activeGame here: the poll only runs right after WE sent the
  // registration tx, so the mapping points at our own new game.
  React.useEffect(() => {
    if (!isPollingGameId) return
    if (
      effectiveGameId &&
      effectiveGameId !== 0n &&
      effectiveGameId !== prevGameIdRef.current
    ) {
      setIsPollingGameId(false)
      return
    }
    let ticks = 0
    const timer = setInterval(async () => {
      ticks++
      const res =
        mode === 'tournament'
          ? await refetchTournamentGameId()
          : await refetchClassicGameId()
      const gid = res.data as bigint | undefined
      const isNewGameId = !!gid && gid !== 0n && gid !== prevGameIdRef.current
      if (isNewGameId) {
        useGameStore.setState({ onChainGameId: gid, onChainStatus: 'registered' })
        try {
          const raw = localStorage.getItem(storageKey)
          if (raw) {
            const entry = JSON.parse(raw)
            entry.gameId = gid.toString()
            localStorage.setItem(storageKey, JSON.stringify(entry))
          }
        } catch {}
        // Re-arm the auto-submit countdown — the original one was consumed
        // (or skipped) while the game id was missing/stale.
        autoSubmitTriggeredRef.current = false
        setCountdown(5)
      }
      if (isNewGameId || ticks > 30) {
        clearInterval(timer)
        setIsPollingGameId(false)
      }
    }, 2000)
    return () => clearInterval(timer)
  }, [isPollingGameId, effectiveGameId, refetchTournamentGameId, refetchClassicGameId, storageKey, mode])

  // Total stablecoin balance across all tokens (USD value)
  const totalStableUsd = (Object.keys(STABLECOIN_TOKENS) as StablecoinSymbol[]).reduce((sum, sym) => {
    return sum + Number(stableBalances[sym]) / 10 ** STABLECOIN_TOKENS[sym].decimals
  }, 0)

  // Detect insufficient-funds errors from wagmi/MiniPay
  const rawErrorMsg = (hasError as any)?.message ?? (typeof hasError === 'string' ? hasError : '')
  const isInsufficientFunds =
    /insufficient funds/i.test(rawErrorMsg) ||
    /not enough/i.test(rawErrorMsg) ||
    /exceeds.*(balance|allowance)/i.test(rawErrorMsg) ||
    (!!hasError && totalStableUsd < 0.09)

  const isUserRejectedError =
    /user rejected/i.test(rawErrorMsg) || /denied/i.test(rawErrorMsg)
  const isTournamentEndedError =
    /tournamentalreadyended|already ended/i.test(rawErrorMsg)

  // Parse raw wagmi/viem errors into a player-friendly message
  const friendlyError = (() => {
    if (!hasError) return null
    if (isInsufficientFunds) return null  // handled by its own UI block below
    if (isTournamentEndedError)
      return 'This tournament has ended — scores can no longer be submitted for it.'
    if (isUserRejectedError)
      return 'Transaction cancelled — tap retry to try again.'
    if (/nonce/i.test(rawErrorMsg))
      return 'Transaction conflict — please retry.'
    if (/network|timeout|fetch/i.test(rawErrorMsg))
      return 'Network issue — check your connection and retry.'
    return 'Something went wrong — tap retry to try again.'
  })()

  // ── Automatic submission retries ─────────────────────────────────────────────
  // Transient failures (RPC hiccups, nonce conflicts, signer-server cold
  // starts) retry themselves with backoff so the score lands without the
  // player having to babysit the retry button. Deliberate cancellations,
  // insufficient funds, and ended tournaments are never auto-retried.
  const autoRetryCountRef = React.useRef(0)
  React.useEffect(() => {
    if (!hasError && !signerError) return
    if (isAllSuccess || isRegistering) return
    if (hasError && (isUserRejectedError || isInsufficientFunds || isTournamentEndedError)) return
    if (autoRetryCountRef.current >= 3) return
    autoRetryCountRef.current++
    const delay = 4000 * autoRetryCountRef.current
    const t = setTimeout(() => {
      if (!canSubmit || isRegistering) return
      handleSubmit()
    }, delay)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasError, signerError])

  React.useEffect(() => {
    if (isAllSuccess && address) {
      const state = useGameStore.getState()
      const onChainSeed = state.onChainSeed
      // The server row is keyed by the local session seed; the on-chain seed is
      // what this modal has always had. Send both, and the row is found either
      // way — sending only the on-chain one matched nothing and left the run
      // active, which is what let a submitted score be offered again.
      const sessionSeed = state.gameSession?.seed?.toString() ?? null

      // Recorded before the network call: a device that submitted a run must
      // never offer to resume it, whatever the server ends up knowing.
      recordSubmittedSeeds(address, sessionSeed, onChainSeed)

      ;(async () => {
        if (isTournamentMode && tournamentId !== null) {
          await markTournamentSessionComplete(
            address,
            tournamentId.toString(),
            sessionSeed,
            onChainSeed
          )
        } else {
          await markSessionComplete(address, sessionSeed, onChainSeed)
        }
        clearStoredGameSession(storageKey)
      })()
    }
  }, [isAllSuccess, storageKey, address])

  // Fire the signature prefetch once submission becomes possible
  React.useEffect(() => {
    if (!isTournamentMode || tournamentId === null) return
    if (!gameSession || !recoveredSeed || !effectiveGameId || !address) return
    if (isAllSuccess || prefetchedSubmitSigRef.current?.gid === effectiveGameId.toString()) return
    let cancelled = false
    requestSubmitSignature(
      tournamentId,
      effectiveGameId,
      gameSession.score,
      gameSession.moveHistory,
      recoveredSeed,
      address,
      gameSession.rulesVersion
    )
      .then((sig) => {
        if (cancelled) return
        prefetchedSubmitSigRef.current = {
          gid: effectiveGameId.toString(),
          score: gameSession.score,
          ...sig,
        }
      })
      .catch(() => {
        // silent — handleSubmit falls back to an on-demand fetch
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTournamentMode, tournamentId, recoveredSeed, effectiveGameId, address, isAllSuccess])

  // Start countdown once we have everything needed to submit. 10s in both
  // modes — 5s was too short for a player deciding whether to pay for a
  // revive, and an auto-submit racing that payment wastes it.
  React.useEffect(() => {
    if (!canSubmit || isRegistering || isAllSuccess) return
    if (countdown !== null) return
    setCountdown(10)
  }, [isTournamentMode, canSubmit, isRegistering, isAllSuccess])

  // Tick the countdown down each second
  React.useEffect(() => {
    if (countdown === null || countdown <= 0) return
    const t = setTimeout(
      () => setCountdown((c) => (c !== null && c > 0 ? c - 1 : c)),
      1000
    )
    return () => clearTimeout(t)
  }, [countdown])

  // Auto-submit when countdown reaches 0
  React.useEffect(() => {
    if (
      countdown === 0 &&
      canSubmit &&
      !isRegistering &&
      !isAllSuccess &&
      !autoSubmitTriggeredRef.current
    ) {
      autoSubmitTriggeredRef.current = true
      handleSubmit()
    }
  }, [countdown])

  // On submission error: reset so user can retry manually
  React.useEffect(() => {
    if (hasError) {
      autoSubmitTriggeredRef.current = false
      setCountdown(null)
    }
  }, [hasError])

  const shadowColor = isTournamentMode
    ? 'var(--accent-pink)'
    : 'var(--game-over-shadow)'
  const accentTextColor = 'var(--ink-fixed)'
  const stats = useMemo(() => {
    const moves = gameSession?.moveHistory ?? []
    const linesCleared = moves.reduce(
      (sum, move) => sum + (move.scoreEvent?.linesCleared ?? 0),
      0
    )
    const bestCombo = moves.reduce(
      (best, move) => Math.max(best, move.scoreEvent?.newComboStreak ?? 0),
      comboStreak
    )
    const estimatedSeconds = moves.length * 7
    const minutes = Math.floor(estimatedSeconds / 60)
    const seconds = estimatedSeconds % 60
    return {
      linesCleared,
      bestCombo,
      piecesPlaced: moves.length,
      time: `${minutes}:${seconds.toString().padStart(2, '0')}`,
    }
  }, [comboStreak, gameSession?.moveHistory])

  // Points that score boost contributed (or would have contributed) this run.
  // Only counts piece placements (pieceIndex >= 0), not bombs.
  const boostDelta = useMemo(() => {
    const moves = gameSession?.moveHistory ?? []
    return moves
      .filter((m) => m.pieceIndex >= 0)
      .reduce((sum, m) => {
        const bp = m.scoreEvent?.basePoints ?? 0
        const cm = m.scoreEvent?.comboMultiplier ?? 1.0
        // boost doubles basePoints, so the added value = basePoints * comboMultiplier
        return sum + Math.round(bp * cm)
      }, 0)
  }, [gameSession?.moveHistory])

  // Total points scored via bomb moves this run
  const bombPoints = useMemo(() => {
    const moves = gameSession?.moveHistory ?? []
    return moves
      .filter((m) => m.bomb != null)
      .reduce((sum, m) => sum + (m.scoreEvent?.totalPoints ?? 0), 0)
  }, [gameSession?.moveHistory])

  // How many times shield auto-saved the run
  const shieldSaves = useMemo(() => {
    const moves = gameSession?.moveHistory ?? []
    return moves.filter((m) => m.revive === true).length
  }, [gameSession?.moveHistory])

  const rankData = useMemo(() => {
    const scores = (leaderboard ?? [])
      .map((entry) => entry.score)
      .sort((a, b) => b - a)
    const currentRank =
      scores.findIndex((value) => score >= value) + 1 || scores.length + 1
    const nextTarget = scores.find((value) => value > score) ?? score
    const lowerScores = scores.filter((value) => value <= score)
    const prevTarget =
      lowerScores.length > 0 ? lowerScores[lowerScores.length - 1] : 0
    const progressBase =
      nextTarget === prevTarget
        ? 100
        : ((score - prevTarget) / Math.max(1, nextTarget - prevTarget)) * 100
    return {
      currentRank,
      nextTarget,
      progress: Math.max(
        8,
        Math.min(100, Number.isFinite(progressBase) ? progressBase : 8)
      ),
      delta: Math.max(0, nextTarget - score),
    }
  }, [leaderboard, score])

  const buildBoardEmoji = (grid: Uint8Array): string => {
    const EMOJI = ['⬛', '🟦', '🟥', '🟩', '🟨', '🟪', '🟧', '🟫', '⬜', '🔴']
    const SIZE = 9
    const rows: string[] = []
    for (let r = 0; r < SIZE; r++) {
      let row = ''
      for (let c = 0; c < SIZE; c++) {
        const cell = grid[r * SIZE + c]
        row += EMOJI[Math.min(cell, EMOJI.length - 1)] ?? '⬛'
      }
      rows.push(row)
    }
    return rows.join('\n')
  }

  const HASHTAGS = `#miniapps #minipay #playblokaz #celo @playblokaz`

  const buildShareText = (withUrl: boolean) => {
    const parts = [` ${score.toLocaleString()} on BLOKAZ 🎮`]
    if (stats.bestCombo > 1)
      parts.push(`×${stats.bestCombo} combo 🔥 · ${stats.linesCleared} lines`)
    else
      parts.push(
        `${stats.linesCleared} lines cleared · rank #${rankData.currentRank}`
      )
    parts.push(``)
    if (gameSession?.grid) parts.push(buildBoardEmoji(gameSession.grid))
    parts.push(``)
    if (withUrl) parts.push(`can you beat it? blokaz.xyz\n`)
    parts.push(HASHTAGS)
    return parts.join('\n')
  }

  const handleShareTwitter = () => {
    // No &url= param — emoji board + hashtags fill ~270 chars, adding a URL would exceed 280
    const text = buildShareText(false)
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const achievementChips = [
    score >= 1000 ? 'NEW HIGH ENERGY' : 'RUN BANKED',
    rankData.currentRank <= 10
      ? `TOP ${rankData.currentRank}`
      : `+${Math.max(1, Math.floor(score / 75))} RANK`,
  ]

  const userIdx = (leaderboard ?? []).findIndex(
    (e) => e.player.toLowerCase() === (address?.toLowerCase() ?? '')
  )

  const visibleTokens = Object.keys(STABLECOIN_TOKENS) as StablecoinSymbol[]

  const formatReviveCost = (sym: StablecoinSymbol) => {
    const cost = getReviveCost(sym)
    const decimals = STABLECOIN_TOKENS[sym].decimals
    const dollars = Number(cost) / 10 ** decimals
    return dollars < 0.01 ? `$${dollars.toFixed(3)}` : `$${dollars.toFixed(2)}`
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        style={{ background: 'var(--overlay)', backdropFilter: 'blur(8px)' }}
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.10]"
        style={{
          backgroundImage:
            'linear-gradient(135deg, transparent 0%, transparent 42%, var(--ink) 42%, var(--ink) 45%, transparent 45%, transparent 100%)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Scroll container — centres on tall screens, top-aligns on short ones */}
      <div className="relative flex min-h-full items-center justify-center px-3 py-6">
        <div className="w-full max-w-sm">
          {/* ── GAME OVER banner ── */}
          <div
            className="mb-[-4px] flex items-center justify-between border-4 border-b-0 border-ink px-4 py-2"
            style={{
              background: 'var(--danger)',
              boxShadow: `6px 0 0 var(--game-over-shadow), -6px 0 0 var(--game-over-shadow), 6px -6px 0 var(--game-over-shadow)`,
            }}
          >
            <span
              className="font-display text-[1.6rem] leading-none tracking-[-0.03em] text-white"
              style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.3)' }}
            >
              GAME OVER
            </span>
            <button
              onClick={onBack ?? handleAbandon}
              className="brutal-btn flex h-9 w-9 items-center justify-center border-[3px] border-white text-white"
              style={{
                background: 'rgba(0,0,0,0.25)',
                boxShadow: '3px 3px 0 rgba(0,0,0,0.3)',
              }}
            >
              <BrutalIcon name="back" size={16} strokeWidth={3} />
            </button>
          </div>

          {/* ── Main card ── */}
          <div
            className="border-4 border-ink"
            style={{
              background: 'var(--paper)',
              boxShadow: `8px 8px 0 ${shadowColor}`,
            }}
          >
            {/* Score + chips row */}
            <div className="flex items-center justify-between border-b-4 border-ink px-4 py-3">
              <div>
                <div className="font-display text-[9px] uppercase tracking-[0.18em] opacity-60">
                  FINAL SCORE
                </div>
                <div
                  className="font-display tabular-nums leading-none"
                  style={{
                    fontSize: 'clamp(2.5rem, 11vw, 3.5rem)',
                    letterSpacing: '-0.04em',
                  }}
                >
                  {score.toLocaleString()}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div
                  className="border-[3px] border-ink px-2.5 py-0.5 font-display text-[9px] uppercase tracking-widest shadow-[2px_2px_0_var(--shadow)]"
                  style={{
                    background: 'var(--accent-lime)',
                    color: accentTextColor,
                  }}
                >
                  NEW HIGH
                </div>
                <div
                  className="border-[3px] border-ink px-2.5 py-0.5 font-display text-[9px] uppercase tracking-widest shadow-[2px_2px_0_var(--shadow)]"
                  style={{
                    background: 'var(--accent-pink)',
                    color: accentTextColor,
                  }}
                >
                  {achievementChips[1]}
                </div>
              </div>
            </div>

            {/* Stats — 4 in a single row */}
            <div className="grid grid-cols-4 border-b-4 border-ink">
              {[
                {
                  label: 'COMBO',
                  value: `×${stats.bestCombo}`,
                  icon: 'zap' as const,
                },
                {
                  label: 'LINES',
                  value: stats.linesCleared,
                  icon: 'star' as const,
                },
                {
                  label: 'PIECES',
                  value: stats.piecesPlaced,
                  icon: 'history' as const,
                },
                { label: 'TIME', value: stats.time, icon: 'timer' as const },
              ].map((stat, i) => (
                <div
                  key={stat.label}
                  className={`p-2 text-center${i < 3 ? ' border-r-4 border-ink' : ''}`}
                  style={{ background: 'var(--paper-2)' }}
                >
                  <div className="mb-0.5 flex items-center justify-center gap-0.5 font-display text-[7px] uppercase tracking-[0.1em] opacity-60">
                    <BrutalIcon name={stat.icon} size={8} strokeWidth={2} />
                    {stat.label}
                  </div>
                  <div
                    className="font-display text-base leading-none"
                    style={{ letterSpacing: '-0.02em' }}
                  >
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Power-up recap strip ── */}
            {(shieldSaves > 0 || boostDelta > 0 || bombPoints > 0) && (
              <div
                className="flex items-stretch border-b-4 border-ink"
                style={{ background: 'var(--paper-2)' }}
              >
                {shieldSaves > 0 && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-0.5 border-r-4 border-ink px-2 py-2">
                    <span className="text-base leading-none">🛡️</span>
                    <div className="font-display text-[8px] uppercase tracking-[0.1em] opacity-60">SHIELD</div>
                    <div className="font-display text-[11px] font-bold leading-none">
                      SAVED ×{shieldSaves}
                    </div>
                  </div>
                )}
                {boostDelta > 0 && (
                  <div
                    className={`flex flex-1 flex-col items-center justify-center gap-0.5 px-2 py-2${bombPoints > 0 ? ' border-r-4 border-ink' : ''}`}
                  >
                    <span className="text-base leading-none">⚡</span>
                    <div className="font-display text-[8px] uppercase tracking-[0.1em] opacity-60">
                      {gameSession?.scoreBoostActive ? 'BOOST ADDED' : 'BOOST MISSED'}
                    </div>
                    <div className="font-display text-[11px] font-bold leading-none">
                      +{boostDelta.toLocaleString()}
                    </div>
                  </div>
                )}
                {bombPoints > 0 && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-0.5 px-2 py-2">
                    <span className="text-base leading-none">💣</span>
                    <div className="font-display text-[8px] uppercase tracking-[0.1em] opacity-60">BOMB PTS</div>
                    <div className="font-display text-[11px] font-bold leading-none">
                      +{bombPoints.toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Near-miss shield prompt ── */}
            {shieldSaves === 0 && stats.bestCombo >= 3 && (
              <div
                className="flex items-center gap-2 border-b-4 border-ink px-3 py-2"
                style={{ background: '#fee2e2', color: 'var(--ink-fixed)' }}
              >
                <span className="text-lg leading-none">🛡️</span>
                <div className="flex flex-col gap-0.5">
                  <div className="font-display text-[9px] uppercase tracking-[0.12em]">
                    YOU LOST ON A ×{getComboMultiplier(stats.bestCombo)} COMBO
                  </div>
                  <div className="font-display text-[8px] uppercase tracking-[0.1em] opacity-60">
                    A Shield would have kept it going
                  </div>
                </div>
              </div>
            )}

            {/* ── Actions ── */}
            <div className="flex flex-col gap-2.5 p-3">
              {/* Revival Bundle credits — shown first when player has pre-purchased credits */}
              {bundleCredits > 0 && !isAllSuccess && (mode === 'classic' || mode === 'tournament') && (
                <button
                  onClick={handleBundleRevive}
                  disabled={isReviving || isRegistering}
                  className="brutal-btn flex w-full items-center justify-center gap-2 border-[3px] border-ink py-3 font-display text-[11px] uppercase tracking-wider shadow-[3px_3px_0_var(--shadow)] disabled:opacity-50"
                  style={{ background: 'var(--accent-lime)', color: 'var(--ink-fixed)' }}
                >
                  USE REVIVAL BUNDLE
                  <span
                    className="border-[2px] border-ink px-2 py-0.5 font-display text-[8px] uppercase tracking-wider"
                    style={{ background: 'var(--ink)', color: 'var(--paper)' }}
                  >
                    {bundleCredits} LEFT
                  </span>
                </button>
              )}

              {/* Stablecoin revival — shown in both classic and tournament modes */}
              {!isAllSuccess && (mode === 'classic' || mode === 'tournament') && (
                <div
                  className="border-[3px] border-ink"
                  style={{ background: 'var(--paper-2)' }}
                >
                  <div
                    className="flex items-center justify-between border-b-[3px] border-ink px-3 py-2"
                    style={{ background: 'var(--paper)' }}
                  >
                    <div className="flex items-center gap-2 font-display text-[10px] uppercase tracking-[0.15em]">
                      <div
                        className="flex h-5 w-5 items-center justify-center border-[2px] border-ink text-[10px]"
                        style={{
                          background: 'var(--accent-cyan)',
                          color: 'var(--ink-fixed)',
                        }}
                      >
                        ⚡
                      </div>
                      CONTINUE YOUR RUN
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="border-[2px] border-ink px-2 py-0.5 font-display text-[8px] uppercase tracking-wider"
                        style={{
                          background: 'var(--accent-cyan)',
                          color: 'var(--ink-fixed)',
                        }}
                      >
                        {formatReviveCost(selectedToken)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5 p-3">
                    {/* Token cards — always show all 3 so player can pick their balance */}
                    <div className="grid grid-cols-3 gap-2">
                      {visibleTokens.map((sym) => {
                        const isSelected = selectedToken === sym
                        const decimals = STABLECOIN_TOKENS[sym].decimals
                        const raw = stableBalances[sym]
                        const balance = (Number(raw) / 10 ** decimals).toFixed(
                          2
                        )
                        const affordable = canAfford(sym)
                        return (
                          <button
                            key={sym}
                            onClick={() => setSelectedToken(sym)}
                            className="flex flex-col items-center gap-1 border-[3px] border-ink px-1 py-2.5 font-display"
                            style={{
                              background: isSelected
                                ? 'var(--accent-cyan)'
                                : 'var(--paper)',
                              color: isSelected
                                ? 'var(--ink-fixed)'
                                : 'var(--ink)',
                              boxShadow: isSelected
                                ? '3px 3px 0 var(--shadow)'
                                : '2px 2px 0 var(--shadow)',
                            }}
                          >
                            <span className="text-[11px] font-bold uppercase tracking-wider">
                              {sym}
                            </span>
                            <span
                              className="text-[9px] tabular-nums"
                              style={{
                                color: isSelected
                                  ? 'var(--ink-fixed)'
                                  : affordable
                                    ? 'var(--ink)'
                                    : 'var(--ink-soft)',
                                opacity: isSelected ? 0.75 : 1,
                              }}
                            >
                              {balance}
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    {/* Revive button */}
                    <button
                      onClick={
                        canAfford(selectedToken)
                          ? handleStableRevive
                          : IS_MINIPAY
                            ? () => window.open(MINIPAY_DEPOSIT_URL, '_blank')
                            : undefined
                      }
                      disabled={
                        isReviving ||
                        isStablePaying ||
                        isRegistering ||
                        (!canAfford(selectedToken) && !IS_MINIPAY)
                      }
                      className="brutal-btn flex w-full items-center justify-center gap-2 border-[3px] border-ink py-3 font-display text-[11px] uppercase tracking-wider shadow-[3px_3px_0_var(--shadow)] disabled:opacity-50"
                      style={{
                        background: 'var(--accent-cyan)',
                        color: 'var(--ink-fixed)',
                      }}
                    >
                      {isStablePaying ? (
                        <div className="brutal-loader" />
                      ) : canAfford(selectedToken) ? (
                        <>
                          <BrutalIcon name="zap" size={13} strokeWidth={2.5} />
                          REVIVE — {formatReviveCost(selectedToken)}{' '}
                          {selectedToken}
                        </>
                      ) : IS_MINIPAY ? (
                        <span>NOT ENOUGH {selectedToken} — DEPOSIT</span>
                      ) : (
                        <span>NOT ENOUGH {selectedToken}</span>
                      )}
                    </button>

                    {stableError && (
                      <div className="text-center font-display text-[8px] uppercase tracking-[0.12em] text-danger">
                        {stableError}
                      </div>
                    )}
                  </div>
                </div>
              )}


              {/* Submit score CTA */}
              {signerError && (
                <div
                  className="border-[3px] border-danger px-3 py-2 font-display text-[9px] uppercase tracking-[0.12em] text-danger"
                  style={{ background: 'var(--paper-2)' }}
                >
                  <BrutalIcon name="alert" size={10} strokeWidth={2.5} />{' '}
                  {signerError}
                </div>
              )}
              {hasError ? (
                <div className="flex flex-col gap-2">
                  <div
                    className="border-[3px] border-danger p-4"
                    style={{
                      background: 'var(--paper-2)',
                      boxShadow: '4px 4px 0 var(--danger)',
                    }}
                  >
                    <div className="mb-1.5 flex items-center gap-2 font-display text-[11px] uppercase tracking-[0.12em] text-danger">
                      <BrutalIcon name="alert" size={12} strokeWidth={2.5} />
                      SCORE NOT SAVED
                    </div>

                    {isInsufficientFunds ? (
                      /* ── Insufficient balance — show balance + deposit CTA ── */
                      <>
                        <p className="mb-1 font-body text-[11px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                          Your wallet balance is{' '}
                          <span className="font-display text-danger">${totalStableUsd.toFixed(2)}</span>
                          {' '}— you need at least{' '}
                          <span className="font-display">$0.10</span>{' '}
                          to cover the network fee and submit your score.
                        </p>
                        <p className="mb-3 font-body text-[10px]" style={{ color: 'var(--ink-soft)', opacity: 0.75 }}>
                          Your score is saved locally and will be here when you return.
                        </p>
                        {IS_MINIPAY && (
                          <button
                            onClick={() => window.open(MINIPAY_DEPOSIT_URL, '_blank')}
                            className="brutal-btn flex w-full items-center justify-center gap-2 border-[3px] border-ink py-3 font-display text-[11px] uppercase tracking-widest"
                            style={{ background: 'var(--accent-cyan)', color: 'var(--ink-fixed)', boxShadow: '3px 3px 0 var(--shadow)' }}
                          >
                            TOP UP WALLET IN MINIPAY
                          </button>
                        )}
                      </>
                    ) : (
                      /* ── Generic error — show message + retry ── */
                      <>
                        <p className="mb-3 font-body text-[11px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                          {friendlyError ?? 'Something went wrong — tap retry to try again.'}
                        </p>
                        <button
                          onClick={handleSubmit}
                          disabled={!canSubmit || isRegistering}
                          className="brutal-btn flex w-full items-center justify-center gap-2 border-[3px] border-ink py-3 font-display text-[11px] uppercase tracking-widest disabled:opacity-50"
                          style={{ background: 'var(--danger)', color: '#fff', boxShadow: '3px 3px 0 rgba(0,0,0,0.25)' }}
                        >
                          {isRegistering ? <div className="brutal-loader" /> : <BrutalIcon name="play" size={13} strokeWidth={2.5} />}
                          RETRY SAVING SCORE
                        </button>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      resetForNextGame()
                      onPlayAgain()
                    }}
                    className="brutal-btn flex w-full items-center justify-center gap-2 border-[3px] border-ink bg-paper-2 py-2.5 font-display text-[10px] uppercase tracking-widest"
                    style={{
                      boxShadow: '3px 3px 0 var(--shadow)',
                      color: 'var(--ink)',
                    }}
                  >
                    SKIP &amp; PLAY AGAIN
                  </button>
                </div>
              ) : (
                <button
                  onClick={
                    isAllSuccess
                      ? () => {
                          resetForNextGame()
                          onPlayAgain()
                        }
                      : handleSubmit
                  }
                  disabled={isRegistering || (!isAllSuccess && !canSubmit)}
                  className="brutal-btn flex w-full flex-col items-center justify-center border-4 border-ink font-display uppercase disabled:opacity-50"
                  style={{
                    background: isAllSuccess
                      ? 'var(--accent-lime)'
                      : 'var(--ink)',
                    color: isAllSuccess ? accentTextColor : 'var(--paper)',
                    boxShadow: '5px 5px 0 var(--shadow)',
                  }}
                >
                  <div className="flex items-center justify-center gap-2 py-3.5 text-sm tracking-[0.15em]">
                    {isRegistering ? (
                      <div className="brutal-loader" />
                    ) : (
                      <BrutalIcon name="play" size={18} strokeWidth={2.5} />
                    )}
                    {isRegistering
                      ? 'SUBMITTING...'
                      : isAllSuccess
                        ? 'PLAY AGAIN'
                        : isTournamentMode
                          ? `SUBMIT SCORE${countdown !== null && countdown > 0 ? ` (${countdown}s)` : ''}`
                          : `PLAY AGAIN${countdown !== null && countdown > 0 ? ` (${countdown}s)` : ''}`}
                  </div>
                  {countdown !== null &&
                    countdown > 0 &&
                    !isRegistering &&
                    !isAllSuccess && (
                      <div className="w-full border-t-[3px] border-ink/30">
                        <div
                          className="h-1.5"
                          style={{
                            width: `${(countdown / 10) * 100}%`,
                            background: 'var(--paper)',
                            transition: 'width 1s linear',
                          }}
                        />
                      </div>
                    )}
                </button>
              )}
              {/* Explain why submit is blocked */}
              {submitBlockReason && !hasError && (
                <div className="text-center font-display text-[9px] uppercase tracking-[0.12em]" style={{ color: 'var(--ink-soft)' }}>
                  {submitBlockReason}
                </div>
              )}

              {/* Register game on-chain when the wallet prompt was missed at
                  start, or when the stored game id is unusable (stale classic
                  game — keep showing it after failed submit attempts too) */}
              {needsRegistration && (!hasError || isStaleClassicGame) && (
                <div className="flex flex-col gap-2">
                  <div
                    className="border-[3px] border-ink px-3 py-2 font-display text-[9px] uppercase tracking-[0.12em]"
                    style={{ background: 'var(--paper-2)', color: 'var(--ink-soft)' }}
                  >
                    {isTournamentMode
                      ? 'Your run was never registered on-chain — register it now to save your score. Your run is safe.'
                      : isStaleClassicGame
                        ? 'Almost there — this run needs a fresh on-chain registration to save your score. Your run is safe.'
                        : 'Game not registered on-chain — register it now to unlock score submission.'}
                  </div>
                  <button
                    onClick={handleRegisterGame}
                    disabled={isRegistering2 || isRegisterSuccess || isTourRegSuccess}
                    className="brutal-btn flex w-full items-center justify-center gap-2 border-[3px] border-ink py-3 font-display text-[11px] uppercase tracking-wider shadow-[3px_3px_0_var(--shadow)] disabled:opacity-50"
                    style={{ background: 'var(--accent-yellow)', color: 'var(--ink-fixed)' }}
                  >
                    {isRegistering2 ? (
                      <><div className="brutal-loader" /> REGISTERING...</>
                    ) : isRegisterSuccess || isTourRegSuccess ? (
                      '✓ REGISTERED — SUBMIT NOW'
                    ) : (
                      'REGISTER GAME ON-CHAIN'
                    )}
                  </button>
                  {tourRegError && !isRegistering2 && (
                    <div className="text-center font-display text-[8px] uppercase tracking-[0.12em] text-danger">
                      {/user rejected|denied/i.test((tourRegError as any)?.message ?? '')
                        ? 'Transaction cancelled — tap register to try again.'
                        : /ended/i.test((tourRegError as any)?.message ?? '')
                          ? 'This tournament has already ended.'
                          : 'Registration failed — tap register to try again.'}
                    </div>
                  )}
                </div>
              )}

              {/* Share / Leaderboard */}
              {showShareSheet ? (
                <div
                  className="border-[3px] border-ink"
                  style={{ background: 'var(--paper-2)' }}
                >
                  <div
                    className="flex items-center justify-between border-b-[3px] border-ink px-3 py-2"
                    style={{ background: 'var(--paper)' }}
                  >
                    <span className="font-display text-[9px] uppercase tracking-[0.18em]">
                      SHARE YOUR RUN
                    </span>
                    <button
                      onClick={() => setShowShareSheet(false)}
                      className="brutal-btn flex h-7 w-7 items-center justify-center border-2 border-ink text-ink"
                      style={{
                        background: 'var(--paper-2)',
                        boxShadow: '2px 2px 0 var(--shadow)',
                      }}
                    >
                      <BrutalIcon name="back" size={12} strokeWidth={3} />
                    </button>
                  </div>
                  <div className="flex gap-2 p-2.5">
                    <button
                      onClick={handleShareTwitter}
                      className="brutal-btn flex w-full items-center justify-center gap-1.5 border-[3px] border-ink py-2.5 font-display text-[10px] uppercase tracking-wider shadow-[3px_3px_0_var(--shadow)]"
                      style={{
                        background: 'var(--ink)',
                        color: 'var(--paper)',
                      }}
                    >
                      <span
                        className="flex h-4 w-4 items-center justify-center border-[2px] border-paper text-[8px] font-bold"
                        style={{
                          background: 'var(--paper)',
                          color: 'var(--ink)',
                        }}
                      >
                        X
                      </span>
                      SHARE ON X
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowShareSheet(true)}
                    className="brutal-btn flex items-center justify-center gap-1.5 border-[3px] border-ink bg-paper-2 py-3 font-display text-[10px] uppercase tracking-wider text-ink shadow-[3px_3px_0_var(--shadow)]"
                  >
                    <BrutalIcon name="rocket" size={12} strokeWidth={2} /> SHARE
                  </button>
                  <button
                    onClick={onOpenLeaderboard}
                    className="brutal-btn border-[3px] border-ink bg-accent-cyan py-3 font-display text-[10px] uppercase tracking-wider shadow-[3px_3px_0_var(--shadow)]"
                    style={{ color: accentTextColor }}
                  >
                    LEADERBOARD
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* /w-full max-w-sm */}
      </div>
      {/* /scroll container */}
    </div>
  )
}

export default GameOverModal

/**
 * Meta-progression store — player level, daily missions, achievements.
 *
 * Address-keyed localStorage, backed by Supabase. localStorage stays the
 * primary copy — it is instant, works offline, and is what every read in the UI
 * hits — while the server holds the durable one, so a new phone or a cleared
 * cache picks the career up rather than starting it again at zero.
 *
 * The server's copy is not a mirror of this one. Games played, total score and
 * best score are counted from game_sessions, a record no client can write to,
 * and overwrite whatever the device believed. The rest — XP, achievements,
 * missions, best combo, lines — exists only here, so the server stores it back
 * and merges two devices by taking the better of each.
 *
 * Nothing here touches the chain, the signer, or the score-replay path, so it
 * cannot affect submissions or leaderboard integrity.
 */

import { create } from 'zustand'
import {
  ACHIEVEMENTS,
  advanceMission,
  isMissionComplete,
  levelFromTotalXp,
  rollDailyMissions,
  titleForLevel,
  todayKey,
  xpForRun,
} from '../engine/meta'
import type { ActiveMission, LifetimeStats, RunSummary } from '../engine/meta'

const STORAGE_PREFIX = 'blokaz:meta:'
const storageKey = (address: string) => `${STORAGE_PREFIX}${address.toLowerCase()}`

export interface MetaProgress {
  totalXp: number
  lifetime: LifetimeStats
  unlockedAchievements: string[]
  missionDay: string
  missions: ActiveMission[]
}

const EMPTY_LIFETIME: LifetimeStats = {
  gamesPlayed: 0,
  totalScore: 0,
  totalLines: 0,
  bestScore: 0,
  bestCombo: 0,
}

function emptyProgress(): MetaProgress {
  return {
    totalXp: 0,
    lifetime: { ...EMPTY_LIFETIME },
    unlockedAchievements: [],
    missionDay: '',
    missions: [],
  }
}

function load(address: string): MetaProgress {
  try {
    const raw = localStorage.getItem(storageKey(address))
    if (!raw) return emptyProgress()
    const parsed = JSON.parse(raw) as Partial<MetaProgress>
    return {
      ...emptyProgress(),
      ...parsed,
      lifetime: { ...EMPTY_LIFETIME, ...(parsed.lifetime ?? {}) },
      unlockedAchievements: parsed.unlockedAchievements ?? [],
      missions: parsed.missions ?? [],
    }
  } catch {
    return emptyProgress()
  }
}

function save(address: string, progress: MetaProgress) {
  try {
    localStorage.setItem(storageKey(address), JSON.stringify(progress))
  } catch {
    // Storage full or blocked — progression is best-effort, never block play.
  }
}

const SERVER_URL =
  (import.meta.env.VITE_SIGNER_URL as string | undefined) ?? 'http://localhost:3001'

/** Pulls the durable copy. Returns null when the server cannot be reached. */
async function fetchServerProgress(address: string): Promise<MetaProgress | null> {
  try {
    const res = await fetch(`${SERVER_URL}/session/meta/${address.toLowerCase()}`)
    if (!res.ok) return null
    const data = await res.json()
    return (data?.progress as MetaProgress) ?? null
  } catch {
    return null
  }
}

/**
 * Pushes this device's copy and adopts what comes back.
 *
 * Fire-and-forget by design: a run is already recorded locally by the time this
 * runs, so a failed save costs nothing but a later sync — never the game.
 */
async function pushServerProgress(
  address: string,
  progress: MetaProgress
): Promise<MetaProgress | null> {
  try {
    const res = await fetch(`${SERVER_URL}/session/meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, progress }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data?.progress as MetaProgress) ?? null
  } catch {
    return null
  }
}

/** Refresh the mission set if the local day rolled over. */
function withCurrentMissions(address: string, progress: MetaProgress): MetaProgress {
  const day = todayKey()
  if (progress.missionDay === day && progress.missions.length === 3) return progress
  return { ...progress, missionDay: day, missions: rollDailyMissions(address, day) }
}

/** What a single run changed — used to drive the post-game reward toasts. */
export interface RunRewards {
  xpGained: number
  levelBefore: number
  levelAfter: number
  missionsCompleted: ActiveMission[]
  achievementsUnlocked: string[]
}

interface MetaState {
  address: string | null
  progress: MetaProgress

  level: number
  intoLevel: number
  needed: number
  title: string

  loadForAddress: (address: string) => void
  syncFromServer: () => Promise<void>
  refreshMissions: () => void
  recordRun: (run: RunSummary) => RunRewards | null
}

function derive(progress: MetaProgress) {
  const { level, intoLevel, needed } = levelFromTotalXp(progress.totalXp)
  return { level, intoLevel, needed, title: titleForLevel(level) }
}

export const useMetaStore = create<MetaState>((set, get) => ({
  address: null,
  progress: emptyProgress(),
  ...derive(emptyProgress()),

  loadForAddress: (address) => {
    const progress = withCurrentMissions(address, load(address))
    save(address, progress)
    set({ address, progress, ...derive(progress) })

    // Then reconcile with the durable copy. Pushing rather than only reading is
    // what carries a device's own history up on first sync, so a player who
    // played before this shipped does not lose it — the server merges the two
    // and returns the result, counted stats included.
    pushServerProgress(address, progress).then((remote) => {
      if (!remote) return
      // Ignore a late reply for a wallet the player has already switched away
      // from — it would write one player's career under another's address.
      if (get().address !== address) return
      const next = withCurrentMissions(address, remote)
      save(address, next)
      set({ progress: next, ...derive(next) })
    })
  },

  /** Re-reads the durable copy without pushing — used on a plain refresh. */
  syncFromServer: async () => {
    const { address } = get()
    if (!address) return
    const remote = await fetchServerProgress(address)
    if (!remote || get().address !== address) return
    const next = withCurrentMissions(address, remote)
    save(address, next)
    set({ progress: next, ...derive(next) })
  },

  refreshMissions: () => {
    const { address, progress } = get()
    if (!address) return
    const next = withCurrentMissions(address, progress)
    if (next === progress) return
    save(address, next)
    set({ progress: next, ...derive(next) })
  },

  /**
   * Fold a finished run into lifetime stats, mission progress, and
   * achievements. Returns what changed so the UI can celebrate it, or null when
   * no wallet is connected yet (nothing to attribute the run to).
   */
  recordRun: (run) => {
    const { address } = get()
    if (!address) return null

    const current = withCurrentMissions(address, get().progress)
    const levelBefore = levelFromTotalXp(current.totalXp).level

    const lifetime: LifetimeStats = {
      gamesPlayed: current.lifetime.gamesPlayed + 1,
      totalScore: current.lifetime.totalScore + run.score,
      totalLines: current.lifetime.totalLines + run.linesCleared,
      bestScore: Math.max(current.lifetime.bestScore, run.score),
      bestCombo: Math.max(current.lifetime.bestCombo, run.bestCombo),
    }

    // Missions — advance, then auto-claim anything that just completed. There
    // is no reason to make the player tap a claim button for XP they earned.
    const missionsCompleted: ActiveMission[] = []
    const missions = current.missions.map((mission) => {
      const progress = advanceMission(mission, run)
      const next = { ...mission, progress }
      if (!mission.claimed && isMissionComplete(next)) {
        next.claimed = true
        missionsCompleted.push(next)
      }
      return next
    })

    const achievementsUnlocked: string[] = []
    const unlocked = new Set(current.unlockedAchievements)
    for (const achievement of ACHIEVEMENTS) {
      if (unlocked.has(achievement.id)) continue
      if (achievement.test(run, lifetime)) {
        unlocked.add(achievement.id)
        achievementsUnlocked.push(achievement.id)
      }
    }

    const xpGained =
      xpForRun(run) +
      missionsCompleted.reduce((sum, m) => sum + m.xp, 0) +
      achievementsUnlocked.reduce((sum, id) => {
        const def = ACHIEVEMENTS.find((a) => a.id === id)
        return sum + (def?.xp ?? 0)
      }, 0)

    const next: MetaProgress = {
      totalXp: current.totalXp + xpGained,
      lifetime,
      unlockedAchievements: [...unlocked],
      missionDay: current.missionDay,
      missions,
    }

    save(address, next)
    set({ progress: next, ...derive(next) })

    // The run is already banked locally; this carries it to the durable copy so
    // it survives this device.
    pushServerProgress(address, next).then((remote) => {
      if (!remote || get().address !== address) return
      const merged = withCurrentMissions(address, remote)
      save(address, merged)
      set({ progress: merged, ...derive(merged) })
    })

    return {
      xpGained,
      levelBefore,
      levelAfter: levelFromTotalXp(next.totalXp).level,
      missionsCompleted,
      achievementsUnlocked,
    }
  },
}))

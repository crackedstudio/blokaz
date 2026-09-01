/**
 * Meta-progression store — player level, daily missions, achievements.
 *
 * Address-keyed localStorage, mirroring powerUpStore's pattern. Entirely
 * client-side: nothing here touches the chain, the signer, or the score-replay
 * path, so it cannot affect submissions or leaderboard integrity.
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

    return {
      xpGained,
      levelBefore,
      levelAfter: levelFromTotalXp(next.totalXp).level,
      missionsCompleted,
      achievementsUnlocked,
    }
  },
}))

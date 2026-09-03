import { describe, it, expect } from 'vitest'
// The server owns the merge — two devices reconcile there, not in the browser.
import {
  mergeProgress,
  withDerivedLifetime,
  emptyProgress,
} from '../../../server/config/meta.js'

const progress = (over: Record<string, any> = {}) => ({
  ...emptyProgress(),
  ...over,
  lifetime: { ...emptyProgress().lifetime, ...(over.lifetime ?? {}) },
})

describe('merging career progress across devices', () => {
  it('keeps the further-along counters from either side', () => {
    // The phone has played more games; the tablet holds a better single run.
    // Neither may erase the other.
    const phone = progress({
      totalXp: 5_000,
      lifetime: { gamesPlayed: 40, totalScore: 90_000, totalLines: 800, bestScore: 7_000, bestCombo: 6 },
    })
    const tablet = progress({
      totalXp: 3_200,
      lifetime: { gamesPlayed: 12, totalScore: 40_000, totalLines: 300, bestScore: 11_500, bestCombo: 9 },
    })

    expect(mergeProgress(phone, tablet)).toMatchObject({
      totalXp: 5_000,
      lifetime: {
        gamesPlayed: 40,
        totalScore: 90_000,
        totalLines: 800,
        bestScore: 11_500,
        bestCombo: 9,
      },
    })
  })

  it('never takes an achievement back', () => {
    const a = progress({ unlockedAchievements: ['first_clear', 'combo_5'] })
    const b = progress({ unlockedAchievements: ['first_clear', 'score_10k'] })

    const merged = mergeProgress(a, b)
    expect([...merged.unlockedAchievements].sort()).toEqual([
      'combo_5',
      'first_clear',
      'score_10k',
    ])
  })

  it('takes the newer day’s missions whole, never a blend', () => {
    // Missions are a daily set of three, not a running total. Mixing yesterday's
    // with today's would leave a player with a card they cannot clear.
    const yesterday = progress({
      missionDay: '2026-09-02',
      missions: [{ kind: 'games', target: 3, progress: 3 }],
    })
    const today = progress({
      missionDay: '2026-09-03',
      missions: [{ kind: 'score', target: 5_000, progress: 0 }],
    })

    expect(mergeProgress(yesterday, today)).toMatchObject({
      missionDay: '2026-09-03',
      missions: [{ kind: 'score', target: 5_000, progress: 0 }],
    })
    // Order of arguments must not decide it.
    expect(mergeProgress(today, yesterday).missionDay).toBe('2026-09-03')
  })

  it('treats a missing side as nothing to merge', () => {
    const local = progress({ totalXp: 900, lifetime: { gamesPlayed: 4 } })
    expect(mergeProgress(null, local)).toMatchObject({ totalXp: 900 })
    expect(mergeProgress(local, null)).toMatchObject({ totalXp: 900 })
    expect(mergeProgress(null, null)).toEqual(emptyProgress())
  })

  it('ignores junk instead of poisoning a counter with NaN', () => {
    // A blob written by an older build, or a hand-edited one, must not be able
    // to erase a career by making every comparison NaN.
    const broken = { totalXp: 'lots', lifetime: { gamesPlayed: null, bestScore: undefined } }
    const good = progress({ totalXp: 1_200, lifetime: { gamesPlayed: 9, bestScore: 4_000 } })

    expect(mergeProgress(broken as any, good)).toMatchObject({
      totalXp: 1_200,
      lifetime: { gamesPlayed: 9, bestScore: 4_000 },
    })
  })
})

describe('counted stats over stored ones', () => {
  it('replaces the reported numbers with what the sessions prove', () => {
    // A device that thinks it played 3 games is behind; one claiming 900 is
    // wrong. Either way the sessions table is the answer.
    const stored = progress({
      totalXp: 4_000,
      lifetime: { gamesPlayed: 3, totalScore: 1_000, totalLines: 250, bestScore: 500, bestCombo: 7 },
    })

    expect(
      withDerivedLifetime(stored, { gamesPlayed: 41, totalScore: 220_000, bestScore: 15_000 })
    ).toMatchObject({
      totalXp: 4_000,
      lifetime: {
        gamesPlayed: 41,
        totalScore: 220_000,
        bestScore: 15_000,
        // Not derivable from a session row — the device stays the only source.
        totalLines: 250,
        bestCombo: 7,
      },
    })
  })

  it('leaves the stored copy alone when nothing was counted', () => {
    // The RPC failed. Showing zeroes would tell a player their career is gone.
    const stored = progress({ lifetime: { gamesPlayed: 12, bestScore: 8_000 } })
    expect(withDerivedLifetime(stored, null)).toMatchObject({
      lifetime: { gamesPlayed: 12, bestScore: 8_000 },
    })
  })
})

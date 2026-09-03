import { describe, it, expect } from 'vitest'
// The server owns the streak; importing it here is what makes the rules a test
// rather than a comment, the same way the ladder mirror is checked.
import {
  computeStreak,
  recentDays,
  dayBefore,
  utcDay,
} from '../../../server/config/streak.js'

const TODAY = '2026-09-03'
const days = (...offsets: number[]) => offsets.map((n) => dayBefore(TODAY, n))

describe('daily streak', () => {
  it('counts consecutive days up to today', () => {
    expect(computeStreak(days(0, 1, 2, 3), TODAY)).toMatchObject({
      current: 4,
      playedToday: true,
      startedOn: dayBefore(TODAY, 3),
    })
  })

  it('holds a streak through today until a whole day is missed', () => {
    // A player who has not opened the app yet today still has their streak.
    // Counting only up to today would show zero every morning and make the
    // number feel arbitrary.
    expect(computeStreak(days(1, 2, 3), TODAY)).toMatchObject({
      current: 3,
      playedToday: false,
    })
  })

  it('breaks once a full day passes with no game', () => {
    // Nothing yesterday and nothing today: the run is over, and the record of
    // it survives as the longest.
    expect(computeStreak(days(2, 3, 4), TODAY)).toMatchObject({
      current: 0,
      longest: 3,
      playedToday: false,
      startedOn: null,
    })
  })

  it('stops at the gap rather than counting every day played', () => {
    // 0,1 then a hole at 2, then 3,4,5 — the current run is the recent pair,
    // the best run is the older three.
    expect(computeStreak(days(0, 1, 3, 4, 5), TODAY)).toMatchObject({
      current: 2,
      longest: 3,
    })
  })

  it('is one day for a first-ever game', () => {
    expect(computeStreak(days(0), TODAY)).toMatchObject({
      current: 1,
      longest: 1,
      playedToday: true,
    })
  })

  it('reports nothing for a player who has never played', () => {
    expect(computeStreak([], TODAY)).toEqual({
      current: 0,
      longest: 0,
      playedToday: false,
      startedOn: null,
    })
  })

  it('counts a day once however many games it holds', () => {
    // The RPC returns distinct days, but several sessions on one day must never
    // inflate a streak if that ever changes.
    const repeated = [...days(0, 0, 0, 1, 1)]
    expect(computeStreak(repeated, TODAY)).toMatchObject({ current: 2 })
  })

  it('accepts timestamps as well as dates', () => {
    // Postgres hands dates back as YYYY-MM-DD, but a driver returning a full
    // timestamp must not silently break every streak.
    expect(
      computeStreak([`${TODAY}T09:15:00.000Z`, `${dayBefore(TODAY)}T22:00:00.000Z`], TODAY)
    ).toMatchObject({ current: 2 })
  })

  it('crosses a month boundary', () => {
    expect(computeStreak(['2026-09-01', '2026-08-31', '2026-08-30'], '2026-09-01')).toMatchObject(
      { current: 3 }
    )
  })
})

describe('the seven-day strip', () => {
  it('ends on today, oldest first', () => {
    const week = recentDays(days(0, 2), TODAY)
    expect(week).toHaveLength(7)
    expect(week[6]).toEqual({ day: TODAY, played: true })
    expect(week[0]).toEqual({ day: dayBefore(TODAY, 6), played: false })
    // Marked exactly where the player played, not from the weekday index the
    // old panels used — which drew a full week for someone with no games.
    expect(week.map((d) => (d.played ? 1 : 0)).join('')).toBe('0000101')
  })

  it('is empty of marks for a player with no games', () => {
    expect(recentDays([], TODAY).every((d) => !d.played)).toBe(true)
  })
})

describe('utcDay', () => {
  it('takes the UTC date, not the local one', () => {
    // 23:30 in UTC+2 is already the next day locally; the streak must not shift
    // with the player's timezone.
    expect(utcDay(new Date('2026-09-03T23:30:00Z'))).toBe('2026-09-03')
    expect(utcDay(new Date('2026-09-04T00:30:00Z'))).toBe('2026-09-04')
  })
})

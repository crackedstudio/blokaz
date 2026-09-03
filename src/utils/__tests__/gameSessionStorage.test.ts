import { describe, it, expect, beforeEach } from 'vitest'
import { recordSubmittedSeeds, isSubmittedSeed } from '../gameSessionStorage'

const PLAYER = '0xFd1a3980f7473bdFE7461e78ADDe78c33d7b006b'
const OTHER = '0xe1a0F916e859624D4edbadA23E4382D327EAf626'

// The seeds that identify one run: the local session seed the server row is
// keyed by, and the on-chain seed the game-over modal holds.
const SESSION_SEED = '184467440737095516'
const ON_CHAIN_SEED =
  '0x9f2c4a1b8d3e5f6072839a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f'

describe('submitted-run memory', () => {
  beforeEach(() => localStorage.clear())

  it('knows a run it recorded, by either of its seeds', () => {
    recordSubmittedSeeds(PLAYER, SESSION_SEED, ON_CHAIN_SEED)

    // Whichever seed the caller happens to hold has to answer, because the two
    // arrive from different places: the session row carries the local one, the
    // game-over modal the on-chain one.
    expect(isSubmittedSeed(PLAYER, SESSION_SEED)).toBe(true)
    expect(isSubmittedSeed(PLAYER, ON_CHAIN_SEED)).toBe(true)
    expect(isSubmittedSeed(PLAYER, null, ON_CHAIN_SEED)).toBe(true)
  })

  it('does not claim a run it never saw', () => {
    recordSubmittedSeeds(PLAYER, SESSION_SEED, ON_CHAIN_SEED)

    // The check gates whether a player is offered their game back, so a false
    // positive costs them an unfinished run.
    expect(isSubmittedSeed(PLAYER, '999999999')).toBe(false)
    expect(isSubmittedSeed(PLAYER)).toBe(false)
    expect(isSubmittedSeed(PLAYER, null, undefined)).toBe(false)
  })

  it('keeps players apart', () => {
    recordSubmittedSeeds(PLAYER, SESSION_SEED)
    expect(isSubmittedSeed(OTHER, SESSION_SEED)).toBe(false)
  })

  it('matches the same wallet in any casing', () => {
    // Addresses reach this from wagmi checksummed and from storage lowercased.
    recordSubmittedSeeds(PLAYER.toLowerCase(), SESSION_SEED)
    expect(isSubmittedSeed(PLAYER, SESSION_SEED)).toBe(true)
  })

  it('accumulates runs without growing without bound', () => {
    for (let n = 0; n < 30; n++) recordSubmittedSeeds(PLAYER, `seed-${n}`)

    // Newest wins: the cap only ever drops runs old enough that no server
    // session could still be lingering for them.
    expect(isSubmittedSeed(PLAYER, 'seed-29')).toBe(true)
    expect(isSubmittedSeed(PLAYER, 'seed-10')).toBe(true)
    expect(isSubmittedSeed(PLAYER, 'seed-0')).toBe(false)
  })

  it('survives unreadable storage rather than throwing', () => {
    // A hostile or corrupted value must not take the game-over screen down.
    localStorage.setItem(`blokaz_submitted_seeds_${PLAYER.toLowerCase()}`, 'not json')
    expect(isSubmittedSeed(PLAYER, SESSION_SEED)).toBe(false)
    recordSubmittedSeeds(PLAYER, SESSION_SEED)
    expect(isSubmittedSeed(PLAYER, SESSION_SEED)).toBe(true)
  })
})

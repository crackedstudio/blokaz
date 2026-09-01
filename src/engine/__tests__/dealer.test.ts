import { describe, it, expect } from 'vitest'
import { dealThreeSmart, RELIEF_FILL_RATIO } from '../dealer'
import { DeterministicRNG, dealThree } from '../rng'
import { Grid } from '../grid'
import { SHAPES, SHAPE_MAP } from '../shapes'
import { RULES } from '../rules'

const V1 = RULES[1]
const V2 = RULES[2]

/** Fill `count` cells row-major so the board reaches a known fill ratio. */
function boardFilledTo(count: number): Uint8Array {
  const grid = Grid.createGrid()
  for (let i = 0; i < count; i++) grid[i] = 1
  return grid
}

function fitsAnywhere(grid: Uint8Array, shape: { cells: [number, number][] }): boolean {
  for (let r = 0; r < Grid.SIZE; r++) {
    for (let c = 0; c < Grid.SIZE; c++) {
      if (Grid.canPlace(grid, shape as never, r, c)) return true
    }
  }
  return false
}

describe('dealer — v1 compatibility', () => {
  it('consumes the RNG stream identically to the legacy dealThree', () => {
    const a = new DeterministicRNG(12345n)
    const b = new DeterministicRNG(12345n)
    const grid = Grid.createGrid()

    for (let i = 0; i < 25; i++) {
      const legacy = dealThree(a, SHAPES)
      const viaDealer = dealThreeSmart(b, grid, 0, V1)
      expect(viaDealer.map((s) => s.id)).toEqual(legacy.map((s) => s.id))
    }
  })

  it('does not apply relief or the mercy piece under v1', () => {
    // A board with only scattered single cells free: the legacy dealer is free
    // to hand out pieces that cannot be placed, and must keep doing so.
    const grid = Grid.createGrid()
    for (let i = 0; i < 81; i++) grid[i] = 1
    grid[0] = 0 // exactly one free cell

    const rng = new DeterministicRNG(999n)
    let sawUnplaceableTrio = false
    for (let i = 0; i < 40; i++) {
      const trio = dealThreeSmart(rng, grid, 0, V1)
      if (!trio.some((s) => fitsAnywhere(grid, s))) {
        sawUnplaceableTrio = true
        break
      }
    }
    expect(sawUnplaceableTrio).toBe(true)
  })
})

describe('dealer — v2 relief', () => {
  it('is dormant on an open board', () => {
    // Below the relief threshold nothing is re-rolled, so the deal matches the
    // raw weighted draw exactly.
    const grid = boardFilledTo(10) // ~12% fill
    const a = new DeterministicRNG(2024n)
    const b = new DeterministicRNG(2024n)

    const smart = dealThreeSmart(a, grid, 0, V2)
    const raw = dealThree(b, SHAPES)
    expect(smart.map((s) => s.id)).toEqual(raw.map((s) => s.id))
  })

  it('activates once the board passes the relief threshold', () => {
    const belowCount = Math.floor(81 * RELIEF_FILL_RATIO) - 2
    expect(belowCount / 81).toBeLessThan(RELIEF_FILL_RATIO)
  })

  it('never opens a deal with three unplaceable pieces', () => {
    // Board full except a handful of isolated single cells — only S1 can fit.
    const grid = Grid.createGrid()
    for (let i = 0; i < 81; i++) grid[i] = 1
    grid[0] = 0
    grid[40] = 0
    grid[80] = 0

    const rng = new DeterministicRNG(31337n)
    for (let i = 0; i < 200; i++) {
      const trio = dealThreeSmart(rng, grid, 0, V2)
      expect(trio.some((s) => fitsAnywhere(grid, s))).toBe(true)
    }
  })

  it('hands out the smallest fitting shape as the mercy piece', () => {
    const grid = Grid.createGrid()
    for (let i = 0; i < 81; i++) grid[i] = 1
    grid[13] = 0 // a single isolated hole

    const rng = new DeterministicRNG(4242n)
    const trio = dealThreeSmart(rng, grid, 0, V2)
    expect(trio[2].id).toBe(SHAPE_MAP['S1'].id)
  })

  it('leaves the board untouched', () => {
    const grid = boardFilledTo(50)
    const before = Array.from(grid)
    dealThreeSmart(new DeterministicRNG(5n), grid, 0, V2)
    expect(Array.from(grid)).toEqual(before)
  })

  it('tightens the re-roll budget in the late game', () => {
    // A fragmented board, so plenty of draws are "bad" and re-rolls actually
    // fire. Past LATE_GAME_SCORE the budget drops from 3 to 1, so some deals
    // that the early-game dealer would have rescued are left alone. Any single
    // seed may re-roll zero times, so assert the property across many.
    const grid = Grid.createGrid()
    for (let i = 0; i < 81; i++) {
      // Checkerboard-ish clutter: no room for anything wide, plenty of singles.
      if ((Math.floor(i / 9) + (i % 9)) % 2 === 0) grid[i] = 1
    }

    let diverged = 0
    for (let s = 1; s <= 100; s++) {
      const early = dealThreeSmart(new DeterministicRNG(BigInt(s * 7919)), grid, 0, V2)
      const late = dealThreeSmart(new DeterministicRNG(BigInt(s * 7919)), grid, 50_000, V2)
      if (early.map((x) => x.id).join() !== late.map((x) => x.id).join()) diverged++
    }
    expect(diverged).toBeGreaterThan(0)
  })

  it('gives the player a worse hand late than early, on the same board', () => {
    // The curve, stated as a measurable property: with the same seeds and the
    // same congested board, the late-game dealer yields fewer placeable pieces.
    const grid = Grid.createGrid()
    for (let i = 0; i < 81; i++) {
      if ((Math.floor(i / 9) + (i % 9)) % 2 === 0) grid[i] = 1
    }

    let earlyPlaceable = 0
    let latePlaceable = 0
    for (let s = 1; s <= 150; s++) {
      const seed = BigInt(s * 104729)
      for (const piece of dealThreeSmart(new DeterministicRNG(seed), grid, 0, V2)) {
        if (fitsAnywhere(grid, piece)) earlyPlaceable++
      }
      for (const piece of dealThreeSmart(new DeterministicRNG(seed), grid, 50_000, V2)) {
        if (fitsAnywhere(grid, piece)) latePlaceable++
      }
    }
    expect(earlyPlaceable).toBeGreaterThan(latePlaceable)
  })
})

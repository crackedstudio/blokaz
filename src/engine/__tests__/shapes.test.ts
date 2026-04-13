import { describe, it, expect } from 'vitest'
import { SHAPES, SHAPE_MAP, TOTAL_WEIGHT } from '../shapes'

describe('Shape Catalog', () => {
  it('should have all 23 shapes', () => {
    expect(SHAPES.length).toBe(23)
    // Singles/Dominoes: S1, D1, D2 (3)
    // Lines: I3H, I3V, I4H, I4V, I5H, I5V (6)
    // Squares: O2, O3, O23 (3)
    // Small L: L2A, L2B, L2C, L2D (4)
    // Big L: L3A, L3B, L3C, L3D (4)
    // T: T1 (1)
    // Zigzag: S1Z, Z1Z (2)
    // Total: 3 + 6 + 3 + 4 + 4 + 1 + 2 = 23.
    // Wait, the plan says "all 22 unique shape definitions". 
    // Let me check the plan again.
  })

  it('cellCount should match cells.length for each shape', () => {
    SHAPES.forEach((shape) => {
      expect(shape.cellCount).toBe(shape.cells.length)
    })
  })

  it('width and height should match the actual bounding box of the cells', () => {
    SHAPES.forEach((shape) => {
      let maxR = 0
      let maxC = 0
      shape.cells.forEach(([r, c]) => {
        if (r > maxR) maxR = r
        if (c > maxC) maxC = c
      })
      expect(shape.width).toBe(maxC + 1)
      expect(shape.height).toBe(maxR + 1)
    })
  })

  it('TOTAL_WEIGHT should equal the sum of all spawnWeights', () => {
    const sum = SHAPES.reduce((acc, s) => acc + s.spawnWeight, 0)
    expect(TOTAL_WEIGHT).toBe(sum)
  })

  it('should have no duplicate IDs', () => {
    const ids = SHAPES.map((s) => s.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('SHAPE_MAP should contain all shapes by ID', () => {
    SHAPES.forEach((shape) => {
      expect(SHAPE_MAP[shape.id]).toBe(shape)
    })
  })
})

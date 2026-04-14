import type { ShapeDefinition } from './shapes'

export class Grid {
  static SIZE = 9

  static createGrid(): Uint8Array {
    return new Uint8Array(Grid.SIZE * Grid.SIZE)
  }

  static getCell(grid: Uint8Array, row: number, col: number): number {
    return grid[row * Grid.SIZE + col]
  }

  static setCell(grid: Uint8Array, row: number, col: number, val: number): void {
    grid[row * Grid.SIZE + col] = val
  }

  static cloneGrid(grid: Uint8Array): Uint8Array {
    return new Uint8Array(grid)
  }

  static canPlace(
    grid: Uint8Array,
    shape: ShapeDefinition,
    row: number,
    col: number
  ): boolean {
    for (const [dr, dc] of shape.cells) {
      const r = row + dr
      const c = col + dc
      if (r < 0 || r >= Grid.SIZE || c < 0 || c >= Grid.SIZE) return false
      if (grid[r * Grid.SIZE + c] !== 0) return false
    }
    return true
  }

  static placeShape(
    grid: Uint8Array,
    shape: ShapeDefinition,
    row: number,
    col: number,
    colorId: number
  ): void {
    for (const [dr, dc] of shape.cells) {
      const r = row + dr
      const c = col + dc
      grid[r * Grid.SIZE + c] = colorId
    }
  }

  static findFullLines(grid: Uint8Array): { rows: number[]; cols: number[] } {
    const rows: number[] = []
    const cols: number[] = []

    // Check rows
    for (let r = 0; r < Grid.SIZE; r++) {
      let full = true
      for (let c = 0; c < Grid.SIZE; c++) {
        if (grid[r * Grid.SIZE + c] === 0) {
          full = false
          break
        }
      }
      if (full) rows.push(r)
    }

    // Check cols
    for (let c = 0; c < Grid.SIZE; c++) {
      let full = true
      for (let r = 0; r < Grid.SIZE; r++) {
        if (grid[r * Grid.SIZE + c] === 0) {
          full = false
          break
        }
      }
      if (full) cols.push(c)
    }

    return { rows, cols }
  }

  static clearLines(
    grid: Uint8Array,
    rows: number[],
    cols: number[]
  ): { cellsCleared: number } {
    const toClear = new Set<number>()

    for (const r of rows) {
      for (let c = 0; c < Grid.SIZE; c++) {
        toClear.add(r * Grid.SIZE + c)
      }
    }

    for (const c of cols) {
      for (let r = 0; r < Grid.SIZE; r++) {
        toClear.add(r * Grid.SIZE + c)
      }
    }

    const cellsCleared = toClear.size
    for (const idx of toClear) {
      grid[idx] = 0
    }

    return { cellsCleared }
  }

  static canPlaceAny(grid: Uint8Array, shapes: ShapeDefinition[]): boolean {
    for (const shape of shapes) {
      for (let r = 0; r < Grid.SIZE; r++) {
        for (let c = 0; c < Grid.SIZE; c++) {
          if (Grid.canPlace(grid, shape, r, c)) {
            return true
          }
        }
      }
    }
    return false
  }

  static gridHash(grid: Uint8Array): string {
    // Simple hash for now: join bytes and convert to hex or just use string
    // Real implementation would use keccak256
    let hash = 0
    for (let i = 0; i < grid.length; i++) {
      hash = (hash << 5) - hash + grid[i]
      hash |= 0 // Convert to 32bit integer
    }
    return hash.toString(16)
  }
}

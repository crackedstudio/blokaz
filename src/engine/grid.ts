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

  /**
   * Full rows and columns, plus — when `allowDiagonals` is set — the two main
   * diagonals. Diagonals are the COSMIC tier mechanic (20k+); `diags` contains
   * 0 for the top-left→bottom-right diagonal and 1 for the anti-diagonal.
   *
   * ⚠️ Mirrored in server/engine/scoreReplay.js. See src/engine/rules.ts.
   */
  static findFullLines(
    grid: Uint8Array,
    allowDiagonals = false
  ): { rows: number[]; cols: number[]; diags: number[] } {
    const rows: number[] = []
    const cols: number[] = []
    const diags: number[] = []

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

    if (allowDiagonals) {
      let mainFull = true
      let antiFull = true
      for (let i = 0; i < Grid.SIZE; i++) {
        if (grid[i * Grid.SIZE + i] === 0) mainFull = false
        if (grid[i * Grid.SIZE + (Grid.SIZE - 1 - i)] === 0) antiFull = false
      }
      if (mainFull) diags.push(0)
      if (antiFull) diags.push(1)
    }

    return { rows, cols, diags }
  }

  static clearLines(
    grid: Uint8Array,
    rows: number[],
    cols: number[],
    diags: number[] = []
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

    for (const d of diags) {
      for (let i = 0; i < Grid.SIZE; i++) {
        toClear.add(d === 0 ? i * Grid.SIZE + i : i * Grid.SIZE + (Grid.SIZE - 1 - i))
      }
    }

    const cellsCleared = toClear.size
    for (const idx of toClear) {
      grid[idx] = 0
    }

    return { cellsCleared }
  }

  /**
   * LIQUID tier mechanic (45k+) — "pieces auto-settle one row down into any gap
   * below them."
   *
   * Applies exactly ONE gravity step, and only to the cells just placed.
   *
   * Cells are processed bottom row first. That ordering is the whole mechanic:
   * top-down, a vertical piece would find its own lower cell in the way, only
   * the bottom cell would drop, and the piece would tear itself apart. Bottom-up,
   * the lower cell vacates first and the piece slides down intact.
   *
   * Returns the cells' positions after settling, for the caller's animation.
   *
   * ⚠️ Mirrored in server/engine/scoreReplay.js. See src/engine/rules.ts.
   */
  static settleLiquid(
    grid: Uint8Array,
    cells: Array<[number, number]>
  ): Array<[number, number]> {
    // Total order: bottom row first, then left to right. Cells sharing a row
    // drop into different columns so they never interact, but pinning the order
    // keeps client and server byte-identical regardless of sort stability.
    const ordered = [...cells].sort((a, b) => (b[0] - a[0]) || (a[1] - b[1]))
    const settled: Array<[number, number]> = []

    for (const [r, c] of ordered) {
      const below = r + 1
      if (below < Grid.SIZE && grid[below * Grid.SIZE + c] === 0) {
        grid[below * Grid.SIZE + c] = grid[r * Grid.SIZE + c]
        grid[r * Grid.SIZE + c] = 0
        settled.push([below, c])
      } else {
        settled.push([r, c])
      }
    }

    return settled
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

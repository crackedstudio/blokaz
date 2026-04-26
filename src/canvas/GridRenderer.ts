import { Grid } from '../engine/grid'

export const COLOR_PALETTE = {
  0: 'transparent',
  1: '#FF3D3D',
  2: '#FF7A1A',
  3: '#FFD51F',
  4: '#B7FF3B',
  5: '#2CE66A',
  6: '#29E6E6',
  7: '#2F6BFF',
  8: '#8A3DFF',
  9: '#FF3BBD',
}

export const TOURNAMENT_PALETTE = {
  0: 'transparent',
  1: '#FF3BBD',  // hot pink  — singles
  2: '#FF7A1A',  // orange    — L-shapes
  3: '#FFD51F',  // yellow    — squares
  4: '#B7FF3B',  // lime      — bigL
  5: '#2CE66A',  // green     — (unused, safety net)
  6: '#29E6E6',  // cyan      — lines
  7: '#2F6BFF',  // blue      — (unused, safety net)
  8: '#8A3DFF',  // purple    — T/other
  9: '#FF3D3D',  // red       — zigzag
}

const getThemeColor = (name: string, fallback: string) => 
  typeof window !== 'undefined' ? (getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback) : fallback

export class GridRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private gridSize: number
  private cellSize: number
  private stripeCache: { valid?: CanvasPattern; invalid?: CanvasPattern } = {}

  constructor(canvas: HTMLCanvasElement, gridSize: number) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.gridSize = gridSize
    this.cellSize = gridSize / 9
  }

  draw(
    grid: Uint8Array,
    ghostCells?: { row: number; col: number; valid: boolean }[],
    isTournament: boolean = false
  ): void {
    this.ctx.clearRect(0, 0, this.gridSize, this.gridSize)

    // Board background
    const inkColor = getThemeColor('--ink', '#0C0C10')
    this.ctx.fillStyle = isTournament ? inkColor : getThemeColor('--paper-lite', '#ffffff')
    this.ctx.fillRect(0, 0, this.gridSize, this.gridSize)

    // Board border
    this.ctx.strokeStyle = inkColor
    this.ctx.lineWidth = 6
    this.ctx.strokeRect(0, 0, this.gridSize, this.gridSize)

    // Gridlines
    this.ctx.strokeStyle = isTournament
      ? 'rgba(245,239,227,0.15)'
      : `${getThemeColor('--ink', '#000')}14`
    this.ctx.lineWidth = 1
    for (let i = 1; i < 9; i++) {
      const pos = i * this.cellSize
      this.ctx.beginPath()
      this.ctx.moveTo(pos, 3)
      this.ctx.lineTo(pos, this.gridSize - 3)
      this.ctx.stroke()
      this.ctx.beginPath()
      this.ctx.moveTo(3, pos)
      this.ctx.lineTo(this.gridSize - 3, pos)
      this.ctx.stroke()
    }

    // Filled cells
    const palette = isTournament ? TOURNAMENT_PALETTE : COLOR_PALETTE
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const val = Grid.getCell(grid, r, c)
        if (val !== 0) {
          this.drawCell(
            r,
            c,
            palette[val as keyof typeof palette],
            isTournament
          )
        }
      }
    }

    // Ghost preview
    if (ghostCells) {
      for (const ghost of ghostCells) {
        this.drawGhostCell(ghost.row, ghost.col, ghost.valid)
      }
    }
  }

  private drawCell(
    row: number,
    col: number,
    color: string,
    isTournament: boolean
  ): void {
    const pad = 1.8
    const x = col * this.cellSize + pad
    const y = row * this.cellSize + pad
    const size = this.cellSize - pad * 2
    if (size <= 0) return

    this.ctx.beginPath()
    this.ctx.rect(x, y, size, size)
    this.ctx.fillStyle = color
    this.ctx.fill()
    this.ctx.strokeStyle = getThemeColor('--ink', '#0C0C10')
    this.ctx.lineWidth = 3
    this.ctx.stroke()

    // Top highlight (glassy)
    this.ctx.fillStyle = 'rgba(255,255,255,0.4)'
    this.ctx.fillRect(x + 1, y + 1, size - 2, Math.floor(size * 0.28))

    // Inner shadow for depth
    const shadowH = Math.floor(size * 0.28)
    this.ctx.fillStyle = 'rgba(0,0,0,0.12)'
    this.ctx.fillRect(x + 1, y + size - shadowH - 1, size - 2, shadowH)

    if (isTournament) {
      this.ctx.strokeStyle = color
      this.ctx.lineWidth = 2
      this.ctx.strokeRect(x - 1, y - 1, size + 2, size + 2)
    }
  }

  private drawGhostCell(row: number, col: number, valid: boolean): void {
    const pad = 1
    const x = col * this.cellSize + pad
    const y = row * this.cellSize + pad
    const size = this.cellSize - pad * 2
    if (size <= 0) return

    const key = valid ? 'valid' : 'invalid'
    if (!this.stripeCache[key]) {
      const pat = this.createStripePattern(valid)
      if (pat) this.stripeCache[key] = pat
    }

    const pattern = this.stripeCache[key]
    if (pattern) {
      this.ctx.fillStyle = pattern
      this.ctx.fillRect(x, y, size, size)
    }

    this.ctx.setLineDash([3, 3])
    this.ctx.strokeStyle = getThemeColor('--ink', '#0C0C10')
    this.ctx.lineWidth = 2
    this.ctx.strokeRect(x, y, size, size)
    this.ctx.setLineDash([])
  }

  private createStripePattern(valid: boolean): CanvasPattern | null {
    const pc = document.createElement('canvas')
    pc.width = 8
    pc.height = 8
    const pCtx = pc.getContext('2d')!
    pCtx.fillStyle = valid ? '#B7FF3B33' : '#FF3D3D33'
    pCtx.fillRect(0, 0, 8, 8)
    pCtx.strokeStyle = valid ? 'rgba(12,12,16,0.35)' : 'rgba(12,12,16,0.45)'
    pCtx.lineWidth = 2
    pCtx.beginPath()
    pCtx.moveTo(-1, 6)
    pCtx.lineTo(6, -1)
    pCtx.moveTo(1, 10)
    pCtx.lineTo(10, 1)
    pCtx.stroke()
    return this.ctx.createPattern(pc, 'repeat')
  }

  getCellSize(): number {
    return this.cellSize
  }

  resize(gridSize: number): void {
    this.gridSize = gridSize
    this.cellSize = gridSize / 9
    this.stripeCache = {}
  }

  get currentGridSize(): number {
    return this.gridSize
  }

  screenToGrid(x: number, y: number): { row: number; col: number } | null {
    const rect = this.canvas.getBoundingClientRect()
    const scaleX = this.canvas.width / rect.width
    const scaleY = this.canvas.height / rect.height
    const canvasX = (x - rect.left) * scaleX
    const canvasY = (y - rect.top) * scaleY
    if (
      canvasX < 0 ||
      canvasX >= this.gridSize ||
      canvasY < 0 ||
      canvasY >= this.gridSize
    ) {
      return null
    }
    return {
      row: Math.floor(canvasY / this.cellSize),
      col: Math.floor(canvasX / this.cellSize),
    }
  }

  // kept for internal usage with square cells
  private roundRect(
    _ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    _r: number
  ) {
    this.ctx.moveTo(x, y)
    this.ctx.lineTo(x + w, y)
    this.ctx.lineTo(x + w, y + h)
    this.ctx.lineTo(x, y + h)
    this.ctx.closePath()
  }
}

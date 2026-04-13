import { Grid } from '../engine/grid'

export const COLOR_PALETTE = {
  0: 'transparent',
  1: '#ff3b3b', // Red
  2: '#3bff3b', // Green
  3: '#3b3bff', // Blue
  4: '#ffff3b', // Yellow
  5: '#ff3bff', // Magenta
  6: '#3bffff', // Cyan
  7: '#ff9d3b', // Orange
  8: '#aa3bff', // Purple
}

export class GridRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private gridSize: number
  private cellSize: number

  constructor(canvas: HTMLCanvasElement, gridSize: number) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.gridSize = gridSize
    this.cellSize = gridSize / 9
  }

  draw(
    grid: Uint8Array,
    ghostCells?: { row: number; col: number; valid: boolean }[]
  ): void {
    this.ctx.clearRect(0, 0, this.gridSize, this.gridSize)

    // Draw background
    this.ctx.fillStyle = '#16171d'
    this.ctx.beginPath()
    this.roundRect(this.ctx, 0, 0, this.gridSize, this.gridSize, 8)
    this.ctx.fill()

    // Draw gridlines (subtle)
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    this.ctx.lineWidth = 1
    for (let i = 1; i < 9; i++) {
      const pos = i * this.cellSize
      // Vertical
      this.ctx.beginPath()
      this.ctx.moveTo(pos, 0)
      this.ctx.lineTo(pos, this.gridSize)
      this.ctx.stroke()
      // Horizontal
      this.ctx.beginPath()
      this.ctx.moveTo(0, pos)
      this.ctx.lineTo(this.gridSize, pos)
      this.ctx.stroke()
    }

    // Draw filled cells
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const val = Grid.getCell(grid, r, c)
        if (val !== 0) {
          this.drawCell(r, c, COLOR_PALETTE[val as keyof typeof COLOR_PALETTE])
        }
      }
    }

    // Draw ghost preview
    if (ghostCells) {
      for (const ghost of ghostCells) {
        const color = ghost.valid
          ? 'rgba(59, 255, 59, 0.3)'
          : 'rgba(255, 59, 59, 0.3)'
        this.drawCell(ghost.row, ghost.col, color)
      }
    }
  }

  private drawCell(row: number, col: number, color: string): void {
    const x = col * this.cellSize + 1
    const y = row * this.cellSize + 1
    const size = this.cellSize - 2

    this.ctx.fillStyle = color
    this.ctx.beginPath()
    this.roundRect(this.ctx, x, y, size, size, 4)
    this.ctx.fill()

    // Subtle drop shadow/glow for filled cells
    if (!color.includes('rgba')) {
      this.ctx.shadowBlur = 4
      this.ctx.shadowColor = 'rgba(0,0,0,0.5)'
      this.ctx.stroke()
      this.ctx.shadowBlur = 0
    }
  }

  getCellSize(): number {
    return this.cellSize
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

  // Polyfill/Helper for rounded rectangles
  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    if (w < 2 * r) r = w / 2
    if (h < 2 * r) r = h / 2
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
}

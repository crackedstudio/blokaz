import type { ShapeDefinition } from '../engine/shapes'
import { COLOR_PALETTE } from './GridRenderer'

export class PieceRenderer {
  private ctx: CanvasRenderingContext2D
  private trayY: number
  private cellSize: number
  private canvasWidth: number

  constructor(
    canvas: HTMLCanvasElement,
    trayY: number,
    cellSize: number
  ) {
    this.ctx = canvas.getContext('2d')!
    this.trayY = trayY
    this.cellSize = cellSize
    this.canvasWidth = canvas.width
  }

  drawTray(pieces: (ShapeDefinition | null)[], activeIndex?: number): void {
    const slotWidth = this.canvasWidth / 3

    pieces.forEach((shape, index) => {
      if (!shape || index === activeIndex) {
        // Draw empty slot
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'
        const slotSize = this.cellSize * 3
        const x = index * slotWidth + (slotWidth - slotSize) / 2
        const y = this.trayY + (slotWidth - slotSize) / 2
        
        this.ctx.beginPath()
        this.roundRect(this.ctx, x, y, slotSize, slotSize, 8)
        this.ctx.fill()
        return
      }

      // Draw piece in tray
      const color = COLOR_PALETTE[(shape.spawnWeight % 8) + 1 as keyof typeof COLOR_PALETTE]
      const scale = 0.7
      const displayCellSize = this.cellSize * scale
      
      const pieceWidth = shape.width * displayCellSize
      const pieceHeight = shape.height * displayCellSize
      
      const x = index * slotWidth + (slotWidth - pieceWidth) / 2
      const y = this.trayY + (slotWidth - pieceHeight) / 2

      this.drawShape(shape, x, y, displayCellSize, color)
    })
  }

  drawDragging(shape: ShapeDefinition, x: number, y: number, cellSize: number): void {
    const color = COLOR_PALETTE[(shape.spawnWeight % 8) + 1 as keyof typeof COLOR_PALETTE]
    
    // Offset above finger
    const dragY = y - 40
    
    // Draw with glow
    this.ctx.shadowBlur = 15
    this.ctx.shadowColor = color
    this.drawShape(shape, x - (shape.width * cellSize) / 2, dragY - (shape.height * cellSize) / 2, cellSize, color)
    this.ctx.shadowBlur = 0
  }

  hitTestTray(x: number, y: number, pieces: (ShapeDefinition | null)[]): number | null {
    const slotWidth = this.canvasWidth / 3
    if (y < this.trayY || y > this.trayY + slotWidth) return null
    
    const index = Math.floor(x / slotWidth)
    if (index >= 0 && index < 3 && pieces[index]) return index
    return null
  }

  private drawShape(shape: ShapeDefinition, x: number, y: number, cellSize: number, color: string): void {
    this.ctx.fillStyle = color
    for (const [dr, dc] of shape.cells) {
      const cx = x + dc * cellSize + 1
      const cy = y + dr * cellSize + 1
      const size = cellSize - 2
      
      this.ctx.beginPath()
      this.roundRect(this.ctx, cx, cy, size, size, 4)
      this.ctx.fill()
    }
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

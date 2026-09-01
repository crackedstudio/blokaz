import { Grid } from '../engine/grid'
import type { TierInfo } from '../engine/scoring'
import { TIER_STRIPED, TIER_COSMIC } from '../engine/rules'

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
  1: COLOR_PALETTE[9], // hot pink  — singles
  2: COLOR_PALETTE[2], // orange    — L-shapes
  3: COLOR_PALETTE[3], // yellow    — squares
  4: COLOR_PALETTE[4], // lime      — bigL
  5: COLOR_PALETTE[5], // green     — (unused, safety net)
  6: COLOR_PALETTE[6], // cyan      — lines
  7: COLOR_PALETTE[7], // blue      — (unused, safety net)
  8: COLOR_PALETTE[8], // purple    — T/other
  9: COLOR_PALETTE[1], // red       — zigzag
}

const getThemeColor = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

// Pixel faces: 5 variations, each is an array of [x,y] ink-pixel coords on an 8×8 grid
const PIXEL_FACES: [number, number][][] = [
  [[2,2],[2,3],[5,2],[5,3],[2,5],[5,5],[3,6],[4,6]], // happy
  [[2,3],[5,2],[5,3],[2,5],[3,6],[4,6],[5,5]],       // wink
  [[2,2],[2,3],[5,2],[5,3],[3,5],[4,5],[3,6],[4,6]], // shocked
  [[2,3],[5,3],[2,5],[3,5],[4,5]],                   // smug
  [[2,3],[3,3],[4,3],[5,3],[3,5],[4,5]],             // sleepy
]

export class GridRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private gridSize: number
  private cellSize: number
  /** Current score tier — controls cell render style */
  private tier: TierInfo | null = null
  /** Animation timestamp in seconds for time-based effects */
  private t: number = 0
  /** Board background colour — refreshed each draw(), used by tier cell renderers */
  private boardBg: string = '#000000'

  constructor(canvas: HTMLCanvasElement, gridSize: number) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.gridSize = gridSize
    this.cellSize = gridSize / 9
  }

  /** Call every frame before draw() to keep time-based effects running */
  setTime(t: number): void {
    this.t = t
  }

  /** Call whenever the player's score tier changes */
  setTier(tier: TierInfo | null): void {
    this.tier = tier
  }

  getCellSizeInScreen(): number {
    const rect = this.canvas.getBoundingClientRect()
    return rect.width / 9
  }

  draw(
    grid: Uint8Array,
    ghostCells?: { row: number; col: number; valid: boolean; colorId?: number }[],
    isTournament: boolean = false
  ): void {
    this.ctx.clearRect(0, 0, this.gridSize, this.gridSize)

    const css = getComputedStyle(document.documentElement)
    const bg = css.getPropertyValue('--board').trim()
    const empty = css.getPropertyValue('--empty-cell').trim()
    const ink = css.getPropertyValue('--ink').trim()
    const rule = css.getPropertyValue('--rule').trim()

    const tierId = this.tier?.id ?? 0

    // Cache board colour so tier cell renderers can use it without re-reading CSS
    this.boardBg = bg

    // Board background — tinted for higher tiers
    this.ctx.fillStyle = bg
    this.ctx.fillRect(0, 0, this.gridSize, this.gridSize)

    // Living background layer for tiers that have it (drawn under cells)
    this.drawBoardBackground(tierId)

    // Board border
    this.ctx.strokeStyle = ink
    this.ctx.lineWidth = 6
    this.ctx.strokeRect(0, 0, this.gridSize, this.gridSize)

    const palette = isTournament ? TOURNAMENT_PALETTE : COLOR_PALETTE
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const val = Grid.getCell(grid, r, c)
        if (val === 0) {
          this.drawEmptyCell(r, c, empty)
        } else {
          const color = palette[val as keyof typeof palette]
          this.drawCellForTier(r, c, color, tierId, val)
        }
      }
    }

    // STRIPED tier mechanic — preview lines that are nearly complete so the
    // player can see combo potential at a glance instead of counting cells.
    this.drawNearCompletePreview(grid, tierId)

    // Gridlines
    this.ctx.strokeStyle = rule
    this.ctx.lineWidth = 1
    this.ctx.setLineDash([])
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

    // ── Pre-compute which rows / cols will clear when ghost lands ────────────
    const clearingRows: number[] = []
    const clearingCols: number[] = []
    if (ghostCells && ghostCells.length > 0 && ghostCells[0].valid) {
      const ghostSet = new Set(ghostCells.map((g) => `${g.row},${g.col}`))
      for (let row = 0; row < 9; row++) {
        let ok = true
        for (let col = 0; col < 9; col++) {
          if (Grid.getCell(grid, row, col) === 0 && !ghostSet.has(`${row},${col}`)) { ok = false; break }
        }
        if (ok) clearingRows.push(row)
      }
      for (let col = 0; col < 9; col++) {
        let ok = true
        for (let row = 0; row < 9; row++) {
          if (Grid.getCell(grid, row, col) === 0 && !ghostSet.has(`${row},${col}`)) { ok = false; break }
        }
        if (ok) clearingCols.push(col)
      }
    }

    // ── PASS 1: clearing-line fill — drawn BEFORE ghost cells ────────────────
    if (clearingRows.length > 0 || clearingCols.length > 0) {
      const accent = this.tier?.accent ?? '#b7ff3b'
      const cr = parseInt(accent.slice(1, 3), 16)
      const cg = parseInt(accent.slice(3, 5), 16)
      const cb = parseInt(accent.slice(5, 7), 16)
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 5)          // 0 → 1, ~0.8 Hz
      const fillAlpha = 0.38 + pulse * 0.24                    // 0.38 – 0.62

      this.ctx.fillStyle = `rgba(${cr},${cg},${cb},${fillAlpha})`
      for (const row of clearingRows) {
        this.ctx.fillRect(0, row * this.cellSize, this.gridSize, this.cellSize)
      }
      for (const col of clearingCols) {
        this.ctx.fillRect(col * this.cellSize, 0, this.cellSize, this.gridSize)
      }

      // White shimmer stripe on the top half of each occupied cell in the line
      // — makes already-placed blocks look "lit up"
      this.ctx.fillStyle = `rgba(255,255,255,${0.18 + pulse * 0.12})`
      const stripeH = Math.ceil(this.cellSize * 0.28)
      for (const row of clearingRows) {
        for (let col = 0; col < 9; col++) {
          if (Grid.getCell(grid, row, col) !== 0) {
            this.ctx.fillRect(col * this.cellSize + 2, row * this.cellSize + 2, this.cellSize - 4, stripeH)
          }
        }
      }
      for (const col of clearingCols) {
        for (let row = 0; row < 9; row++) {
          if (Grid.getCell(grid, row, col) !== 0) {
            this.ctx.fillRect(col * this.cellSize + 2, row * this.cellSize + 2, this.cellSize - 4, stripeH)
          }
        }
      }
    }

    // ── Ghost preview — rendered as solid piece cells ─────────────────────────
    if (ghostCells) {
      const palette = isTournament ? TOURNAMENT_PALETTE : COLOR_PALETTE
      for (const ghost of ghostCells) {
        const color = ghost.colorId !== undefined
          ? palette[ghost.colorId as keyof typeof palette]
          : undefined
        this.drawGhostCell(ghost.row, ghost.col, ghost.valid, color)
      }
    }

    // ── PASS 2: clearing-line border — drawn AFTER ghost cells ───────────────
    // Rendered on top so the glow is never obscured by the ghost piece
    if (clearingRows.length > 0 || clearingCols.length > 0) {
      const accent = this.tier?.accent ?? '#b7ff3b'
      const cr = parseInt(accent.slice(1, 3), 16)
      const cg = parseInt(accent.slice(3, 5), 16)
      const cb = parseInt(accent.slice(5, 7), 16)
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 5)
      const strokeAlpha = 0.75 + pulse * 0.25                  // 0.75 – 1.0

      this.ctx.save()
      this.ctx.strokeStyle = `rgba(${cr},${cg},${cb},${strokeAlpha})`
      this.ctx.lineWidth = 3
      this.ctx.setLineDash([])
      this.ctx.shadowColor = `rgba(${cr},${cg},${cb},${0.55 + pulse * 0.3})`
      this.ctx.shadowBlur = 10 + pulse * 6

      for (const row of clearingRows) {
        this.ctx.strokeRect(2, row * this.cellSize + 2, this.gridSize - 4, this.cellSize - 4)
      }
      for (const col of clearingCols) {
        this.ctx.strokeRect(col * this.cellSize + 2, 2, this.cellSize - 4, this.gridSize - 4)
      }
      this.ctx.restore()
    }
  }

  // ─────────────────────────────────────────────────────────────
  // TIER-AWARE CELL DISPATCH
  // ─────────────────────────────────────────────────────────────

  private drawCellForTier(
    row: number,
    col: number,
    color: string,
    tierId: number,
    cellIdx: number
  ): void {
    switch (tierId) {
      case 0: return this.drawCellPaper(row, col, color)
      case 1: return this.drawCellSticker(row, col, color)
      case 2: return this.drawCellStriped(row, col, color)
      case 3: return this.drawCellPixel(row, col, color, cellIdx)
      case 4: return this.drawCellNeon(row, col, color)
      case 5: return this.drawCellCosmic(row, col, color, cellIdx)
      case 6: return this.drawCellLiquid(row, col, color)
      case 7: return this.drawCellGlitch(row, col, color, cellIdx)
      default: return this.drawCellPaper(row, col, color)
    }
  }

  // ─── T1: PAPER — flat ink, hard border (the default look) ───
  private drawCellPaper(row: number, col: number, color: string): void {
    const pad = 1.8
    const x = col * this.cellSize + pad
    const y = row * this.cellSize + pad
    const size = this.cellSize - pad * 2
    if (size <= 0) return

    this.ctx.fillStyle = color
    this.ctx.fillRect(x, y, size, size)
    this.ctx.strokeStyle = 'rgba(0,0,0,0.45)'
    this.ctx.lineWidth = 2.5
    this.ctx.strokeRect(x, y, size, size)
    this.ctx.fillStyle = 'rgba(255,255,255,0.18)'
    this.ctx.fillRect(x + 1, y + 1, size - 2, Math.floor(size * 0.26))
    const shadowH = Math.floor(size * 0.26)
    this.ctx.fillStyle = 'rgba(0,0,0,0.14)'
    this.ctx.fillRect(x + 1, y + size - shadowH - 1, size - 2, shadowH)
  }

  // ─── T2: STICKER — gloss vinyl highlight top-left corner ───
  private drawCellSticker(row: number, col: number, color: string): void {
    const pad = 1.8
    const x = col * this.cellSize + pad
    const y = row * this.cellSize + pad
    const size = this.cellSize - pad * 2
    if (size <= 0) return

    this.ctx.fillStyle = color
    this.ctx.fillRect(x, y, size, size)
    this.ctx.strokeStyle = 'rgba(0,0,0,0.45)'
    this.ctx.lineWidth = 2.5
    this.ctx.strokeRect(x, y, size, size)

    // Corner gloss — two overlapping rects skewed to fake a parallelogram
    this.ctx.save()
    this.ctx.beginPath()
    this.ctx.rect(x, y, size, size)
    this.ctx.clip()
    // Main gloss band
    this.ctx.fillStyle = 'rgba(255,255,255,0.55)'
    this.ctx.save()
    this.ctx.transform(1, 0, -0.32, 1, x + size * 0.08, y + size * 0.08)
    this.ctx.fillRect(0, 0, size * 0.32, size * 0.18)
    this.ctx.restore()
    // Secondary gloss band
    this.ctx.fillStyle = 'rgba(255,255,255,0.35)'
    this.ctx.save()
    this.ctx.transform(1, 0, -0.32, 1, x + size * 0.08, y + size * 0.32)
    this.ctx.fillRect(0, 0, size * 0.16, size * 0.08)
    this.ctx.restore()
    this.ctx.restore()
  }

  // ─── T3: STRIPED — diagonal repeating lines inside the cell ───
  private drawCellStriped(row: number, col: number, color: string): void {
    const pad = 1.8
    const x = col * this.cellSize + pad
    const y = row * this.cellSize + pad
    const size = this.cellSize - pad * 2
    if (size <= 0) return

    this.ctx.fillStyle = color
    this.ctx.fillRect(x, y, size, size)
    this.ctx.strokeStyle = 'rgba(0,0,0,0.45)'
    this.ctx.lineWidth = 2.5
    this.ctx.strokeRect(x, y, size, size)

    // Diagonal hatch stripes drawn clipped to the cell
    this.ctx.save()
    this.ctx.beginPath()
    this.ctx.rect(x + 1, y + 1, size - 2, size - 2)
    this.ctx.clip()
    this.ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    this.ctx.lineWidth = Math.max(1, size * 0.05)
    const stride = size * 0.22
    for (let i = -size; i < size * 2; i += stride) {
      this.ctx.beginPath()
      this.ctx.moveTo(x + i, y)
      this.ctx.lineTo(x + i + size, y + size)
      this.ctx.stroke()
    }
    this.ctx.restore()
  }

  // ─── T4: PIXEL — 8-bit face per cell ───
  private drawCellPixel(row: number, col: number, color: string, cellIdx: number): void {
    const pad = 1.8
    const x = col * this.cellSize + pad
    const y = row * this.cellSize + pad
    const size = this.cellSize - pad * 2
    if (size <= 0) return

    this.ctx.fillStyle = color
    this.ctx.fillRect(x, y, size, size)
    this.ctx.strokeStyle = 'rgba(0,0,0,0.45)'
    this.ctx.lineWidth = 2.5
    this.ctx.strokeRect(x, y, size, size)

    const px = size / 8
    const faceIdx = (cellIdx + row * 9 + col) % 5
    const face = PIXEL_FACES[faceIdx]

    // Small white highlight pixel in top-left
    this.ctx.fillStyle = 'rgba(255,255,255,0.7)'
    this.ctx.fillRect(x + px, y + px, px, px)

    // Draw face pixels
    this.ctx.fillStyle = 'rgba(0,0,0,0.65)'
    for (const [fx, fy] of face) {
      this.ctx.fillRect(x + fx * px, y + fy * px, px, px)
    }
  }

  // ─── T5: NEON — dark bg, glowing inner ring, pulsing center ───
  private drawCellNeon(row: number, col: number, color: string): void {
    const pad = 1.8
    const x = col * this.cellSize + pad
    const y = row * this.cellSize + pad
    const size = this.cellSize - pad * 2
    if (size <= 0) return

    const pulse = 0.5 + 0.5 * Math.sin(this.t * 1.4 + row * 0.7 + col * 0.5)

    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)

    // Near-black base — neon glow only reads cleanly against true dark
    this.ctx.fillStyle = '#080c12'
    this.ctx.fillRect(x, y, size, size)

    // Faint inner fill — gives the ring an ambient interior colour
    const ip = size * 0.18
    this.ctx.fillStyle = `rgba(${r},${g},${b},0.08)`
    this.ctx.fillRect(x + ip, y + ip, size - ip * 2, size - ip * 2)

    // Glowing inner ring — the signature neon element, moderate glow
    this.ctx.save()
    this.ctx.shadowColor = color
    this.ctx.shadowBlur = size * (0.14 + pulse * 0.1)
    this.ctx.strokeStyle = color
    this.ctx.lineWidth = Math.max(1.5, size * 0.07)
    this.ctx.strokeRect(x + size * 0.15, y + size * 0.15, size * 0.7, size * 0.7)
    this.ctx.restore()

    // Center dot — steady glow, gentle pulse
    const dotSize = size * (0.17 + pulse * 0.09)
    this.ctx.save()
    this.ctx.shadowColor = color
    this.ctx.shadowBlur = size * 0.14
    this.ctx.fillStyle = color
    this.ctx.globalAlpha = 0.58 + pulse * 0.2
    this.ctx.fillRect(x + (size - dotSize) / 2, y + (size - dotSize) / 2, dotSize, dotSize)
    this.ctx.restore()

    // Dark outer border — anchors the cell cleanly
    this.ctx.strokeStyle = 'rgba(0,0,0,0.5)'
    this.ctx.lineWidth = 2
    this.ctx.setLineDash([])
    this.ctx.strokeRect(x, y, size, size)
  }

  // ─── T6: COSMIC — dark bg, nebula gradient, star speckles ───
  private drawCellCosmic(row: number, col: number, color: string, cellIdx: number): void {
    const pad = 1.8
    const x = col * this.cellSize + pad
    const y = row * this.cellSize + pad
    const size = this.cellSize - pad * 2
    if (size <= 0) return

    const breath = 1 + 0.025 * Math.sin(this.t * 1.2 + cellIdx)

    // Background from CSS (theme-synced) instead of hardcoded near-black
    this.ctx.fillStyle = this.boardBg
    this.ctx.fillRect(x, y, size, size)

    // Nebula glow — reduced centre opacity for light-sensitivity comfort
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    const cx2 = x + size * (0.4 + Math.sin(this.t * 0.5 + cellIdx) * 0.2)
    const cy2 = y + size * (0.5 + Math.cos(this.t * 0.4 + cellIdx) * 0.2)
    const grad = this.ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, size * 0.7)
    grad.addColorStop(0, `rgba(${r},${g},${b},0.58)`)
    grad.addColorStop(0.4, `rgba(${r},${g},${b},0.16)`)
    grad.addColorStop(1, 'transparent')
    this.ctx.fillStyle = grad
    this.ctx.fillRect(x, y, size, size)

    // Star speckles — slower flicker, lower max alpha
    const seed = (cellIdx + 1) * 9301
    const rand = (n: number) => {
      const val = Math.sin(seed + n * 12.9898) * 43758.5453
      return val - Math.floor(val)
    }
    for (let i = 0; i < 6; i++) {
      const sx = x + rand(i * 2) * size
      const sy = y + rand(i * 2 + 1) * size
      // Slower twinkle: was 2.4 rad/s, now 1.0 rad/s
      const tw = 0.35 + 0.65 * (Math.sin(this.t * 1.0 + rand(i * 5) * 6.28) * 0.5 + 0.5)
      const isTinted = rand(i * 7) > 0.55
      const sp = Math.max(1, size * 0.04 * (0.5 + rand(i * 3) * 1.4))
      this.ctx.fillStyle = isTinted ? color : '#ffffff'
      // Halved alpha ceiling
      this.ctx.globalAlpha = tw * (isTinted ? 0.5 : 0.42)
      this.ctx.fillRect(sx - sp / 2, sy - sp / 2, sp, sp)
    }
    this.ctx.globalAlpha = 1

    // Anchor star — reduced glow
    this.ctx.save()
    this.ctx.shadowColor = color
    this.ctx.shadowBlur = size * 0.1
    this.ctx.fillStyle = '#ffffff'
    const starSize = size * 0.07 * breath
    this.ctx.fillRect(x + (size - starSize) / 2, y + (size - starSize) / 2, starSize, starSize)
    this.ctx.restore()

    // Border — glowing colored outline, calmer than before
    this.ctx.save()
    this.ctx.shadowColor = `rgba(${r},${g},${b},0.6)`
    this.ctx.shadowBlur = size * 0.16
    this.ctx.strokeStyle = `rgba(${r},${g},${b},0.85)`
    this.ctx.lineWidth = 2.5
    this.ctx.setLineDash([])
    this.ctx.strokeRect(x, y, size, size)
    this.ctx.restore()
  }

  // ─── T7: LIQUID — dark bg, animated sloshing liquid wave ───
  private drawCellLiquid(row: number, col: number, color: string): void {
    const pad = 1.8
    const x = col * this.cellSize + pad
    const y = row * this.cellSize + pad
    const size = this.cellSize - pad * 2
    if (size <= 0) return

    // Dark container
    this.ctx.fillStyle = '#0c0c10'
    this.ctx.fillRect(x, y, size, size)

    // Clamp drawing to cell
    this.ctx.save()
    this.ctx.beginPath()
    this.ctx.rect(x, y, size, size)
    this.ctx.clip()

    const phase = this.t * 1.1 + row * 0.7 + col * 0.5
    const waveH = size * (0.42 + Math.sin(phase) * 0.06)
    const waveTop = y + waveH

    // Parse color for gradient
    const r = parseInt(color.slice(1, 3), 16)
    const g2 = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    const fillGrad = this.ctx.createLinearGradient(x, waveTop, x, y + size)
    fillGrad.addColorStop(0, `rgba(${r},${g2},${b},0.85)`)
    fillGrad.addColorStop(1, `rgba(${r},${g2},${b},1)`)

    // Wave path — waveOff slowed from 3→1.6 rad/s (calmer surface chop)
    const waveX1 = size * 0.25
    const waveOff = Math.sin(this.t * 0.8 + col * 0.8) * size * 0.05
    this.ctx.beginPath()
    this.ctx.moveTo(x, waveTop)
    this.ctx.quadraticCurveTo(x + waveX1, waveTop - waveOff, x + size / 2, waveTop)
    this.ctx.quadraticCurveTo(x + size * 0.75, waveTop + waveOff, x + size, waveTop)
    this.ctx.lineTo(x + size, y + size)
    this.ctx.lineTo(x, y + size)
    this.ctx.closePath()
    this.ctx.fillStyle = fillGrad
    this.ctx.fill()

    // Meniscus highlight — opacity reduced 0.55→0.32 for light sensitivity
    this.ctx.strokeStyle = 'rgba(255,255,255,0.32)'
    this.ctx.lineWidth = Math.max(1, size * 0.04)
    this.ctx.setLineDash([])
    this.ctx.beginPath()
    this.ctx.moveTo(x, waveTop + 4)
    this.ctx.quadraticCurveTo(x + waveX1, waveTop + 4 - waveOff * 0.8, x + size / 2, waveTop + 4)
    this.ctx.quadraticCurveTo(x + size * 0.75, waveTop + 4 + waveOff * 0.8, x + size, waveTop + 4)
    this.ctx.stroke()

    // Bubble highlight — opacity reduced 0.6→0.38
    this.ctx.fillStyle = 'rgba(255,255,255,0.38)'
    const bx = x + size * 0.65
    const by = y + size * 0.5
    const br = size * 0.06
    this.ctx.beginPath()
    this.ctx.arc(bx, by, br, 0, Math.PI * 2)
    this.ctx.fill()

    this.ctx.restore()

    // Border
    this.ctx.strokeStyle = 'rgba(0,0,0,0.45)'
    this.ctx.lineWidth = 2.5
    this.ctx.setLineDash([])
    this.ctx.strokeRect(x, y, size, size)
  }

  // ─── T8: GLITCH — RGB split, scanlines, random slip ───
  private drawCellGlitch(row: number, col: number, color: string, cellIdx: number): void {
    const pad = 1.8
    const x = col * this.cellSize + pad
    const y = row * this.cellSize + pad
    const size = this.cellSize - pad * 2
    if (size <= 0) return

    // Slip: 2.5→1.2 rad/s (~0.4→0.19 Hz)
    const slip = Math.sin(this.t * 1.2 + cellIdx) > 0.88 ? size * 0.08 : 0

    // Dark background
    this.ctx.fillStyle = '#0c0c10'
    this.ctx.fillRect(x, y, size, size)

    this.ctx.save()
    this.ctx.beginPath()
    this.ctx.rect(x, y, size, size)
    this.ctx.clip()

    // Main color layer with slip
    this.ctx.fillStyle = color
    this.ctx.fillRect(x + slip * 0.3, y, size, size)

    // Pink channel — switched to source-over, alpha halved (0.45→0.22)
    this.ctx.globalCompositeOperation = 'source-over'
    this.ctx.fillStyle = 'rgba(255,59,189,0.22)'
    this.ctx.fillRect(x - slip * 0.6, y, size, size)

    // Cyan channel — alpha reduced (0.35→0.18)
    this.ctx.globalCompositeOperation = 'screen'
    this.ctx.fillStyle = 'rgba(41,230,230,0.18)'
    this.ctx.fillRect(x + slip * 0.6, y, size, size)

    // Scanlines
    this.ctx.globalCompositeOperation = 'source-over'
    const lineH = Math.max(1, size * 0.05)
    const lineStride = Math.max(2, size * 0.1)
    this.ctx.fillStyle = 'rgba(0,0,0,0.35)'
    for (let ly = y; ly < y + size; ly += lineStride) {
      this.ctx.fillRect(x, ly, size, lineH)
    }

    // Data band — 2→1 rad/s (~0.16 Hz)
    if (Math.sin(this.t * 1 + cellIdx * 2) > 0.9) {
      this.ctx.fillStyle = 'rgba(255,255,255,0.10)'
      this.ctx.fillRect(x, y + size * 0.4, size, size * 0.08)
    }

    this.ctx.globalCompositeOperation = 'source-over'
    this.ctx.restore()

    // Border
    this.ctx.strokeStyle = 'rgba(0,0,0,0.45)'
    this.ctx.lineWidth = 2.5
    this.ctx.setLineDash([])
    this.ctx.strokeRect(x, y, size, size)
  }

  // ─────────────────────────────────────────────────────────────
  // LIVING BOARD BACKGROUNDS — per-tier animated layer behind cells
  // ─────────────────────────────────────────────────────────────
  private drawBoardBackground(tierId: number): void {
    const s = this.gridSize
    const t = this.t

    if (tierId === 1) {
      // Sticker: slow drifting pink gloss bands
      this.ctx.save()
      this.ctx.globalAlpha = 0.06
      const offset = (t * 18) % 110
      for (let i = -110; i < s + 110; i += 110) {
        this.ctx.fillStyle = '#ff3bbd'
        this.ctx.save()
        this.ctx.transform(1, 0, Math.tan((115 * Math.PI) / 180), 1, 0, 0)
        this.ctx.fillRect(i + offset, 0, 40, s)
        this.ctx.restore()
      }
      this.ctx.restore()
    } else if (tierId === 2) {
      // Striped: drifting diagonal hatch
      this.ctx.save()
      this.ctx.globalAlpha = 0.08
      this.ctx.strokeStyle = '#ff7a1a'
      this.ctx.lineWidth = 3
      const drift = (t * 30) % 24
      for (let i = -s; i < s * 2; i += 24) {
        this.ctx.beginPath()
        this.ctx.moveTo(i + drift, 0)
        this.ctx.lineTo(i + drift + s, s)
        this.ctx.stroke()
      }
      this.ctx.restore()
    } else if (tierId === 3) {
      // Pixel: twinkling pixel constellation
      this.ctx.save()
      for (let i = 0; i < 14; i++) {
        const phase = t * 0.8 + i * 1.3
        const alpha = (Math.sin(phase) * 0.5 + 0.5) * 0.7
        const px = ((i * 73) % 100) / 100 * s
        const py = ((i * 137) % 100) / 100 * s
        this.ctx.fillStyle = '#b7ff3b'
        this.ctx.globalAlpha = alpha
        this.ctx.fillRect(px - 3, py - 3, 6, 6)
      }
      this.ctx.globalAlpha = 1
      this.ctx.restore()
    } else if (tierId === 5) {
      // Cosmic: drifting starfield — dimmed for light-sensitivity comfort
      this.ctx.save()
      for (let i = 0; i < 30; i++) {
        const speed = 4 + (i % 4) * 3          // slower drift
        const drift = ((i * 23 + t * speed) % (s + 20)) - 10
        const px = ((i * 37) % 100) / 100 * s
        const alpha = 0.18 + ((i * 13) % 6) / 14  // max ~0.6 → ~0.43
        this.ctx.globalAlpha = alpha
        this.ctx.fillStyle = '#ffffff'
        this.ctx.beginPath()
        this.ctx.arc(px, drift, 1.2, 0, Math.PI * 2)   // slightly smaller
        this.ctx.fill()
      }
      this.ctx.globalAlpha = 1
      this.ctx.restore()
    } else if (tierId === 6) {
      // Liquid: subtle ripple rings — reduced from 3→2 rings, slower, lower alpha
      this.ctx.save()
      const cx = s / 2
      const cy = s / 2
      for (let i = 0; i < 2; i++) {
        const phase = (t * 0.14 + i * 0.5) % 1
        const radius = phase * s * 0.65
        const alpha = (1 - phase) * 0.18
        this.ctx.globalAlpha = alpha
        this.ctx.strokeStyle = '#29e6e6'
        this.ctx.lineWidth = 1.5
        this.ctx.beginPath()
        this.ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        this.ctx.stroke()
      }
      this.ctx.globalAlpha = 1
      this.ctx.restore()
    } else if (tierId === 7) {
      // Glitch: slow RGB scan band — full-frame flash removed (seizure risk).
      // Band speed halved (90→42), difference blend replaced with source-over,
      // alpha halved on both lines.
      this.ctx.save()
      const bandY = ((t * 10) % 100) / 100 * s
      this.ctx.globalCompositeOperation = 'source-over'
      this.ctx.fillStyle = '#ff3bbd'
      this.ctx.globalAlpha = 0.22
      this.ctx.fillRect(0, bandY, s, 4)
      this.ctx.globalCompositeOperation = 'screen'
      this.ctx.fillStyle = '#29e6e6'
      this.ctx.globalAlpha = 0.16
      this.ctx.fillRect(0, (bandY + s * 0.3) % s, s, 2)
      this.ctx.globalCompositeOperation = 'source-over'
      this.ctx.globalAlpha = 1
      this.ctx.restore()
    }
  }

  /**
   * STRIPED tier (1.5k+) and above: softly light the remaining gaps in any row
   * or column that is one or two cells from clearing, and — once COSMIC unlocks
   * diagonal clears — the two diagonals as well.
   *
   * Purely visual. It reads board state and paints; it never influences
   * scoring, so it stays outside the replay-verified path entirely.
   */
  private drawNearCompletePreview(grid: Uint8Array, tierId: number): void {
    if (tierId < TIER_STRIPED) return

    const accent = this.tier?.accent ?? '#ff7a1a'
    // Slow pulse so the hint reads as ambient rather than as an alert.
    const pulse = 0.5 + 0.5 * Math.sin(this.t / 320)
    const pad = 1.8
    const size = this.cellSize - pad * 2
    if (size <= 0) return

    // gaps === 1 is one placement away and gets the stronger glow.
    const alphaFor = (gaps: number) => (gaps === 1 ? 0.3 + 0.22 * pulse : 0.12 + 0.1 * pulse)

    const paint = (cells: Array<[number, number]>, gaps: number) => {
      this.ctx.save()
      this.ctx.globalAlpha = alphaFor(gaps)
      this.ctx.fillStyle = accent
      for (const [r, c] of cells) {
        this.ctx.fillRect(c * this.cellSize + pad, r * this.cellSize + pad, size, size)
      }
      this.ctx.restore()
    }

    // Rows
    for (let r = 0; r < 9; r++) {
      const gapCells: Array<[number, number]> = []
      for (let c = 0; c < 9; c++) {
        if (Grid.getCell(grid, r, c) === 0) gapCells.push([r, c])
      }
      if (gapCells.length > 0 && gapCells.length <= 2) paint(gapCells, gapCells.length)
    }

    // Columns
    for (let c = 0; c < 9; c++) {
      const gapCells: Array<[number, number]> = []
      for (let r = 0; r < 9; r++) {
        if (Grid.getCell(grid, r, c) === 0) gapCells.push([r, c])
      }
      if (gapCells.length > 0 && gapCells.length <= 2) paint(gapCells, gapCells.length)
    }

    // Diagonals — only meaningful once COSMIC makes them clearable.
    if (tierId >= TIER_COSMIC) {
      for (const isMain of [true, false]) {
        const gapCells: Array<[number, number]> = []
        for (let i = 0; i < 9; i++) {
          const r = i
          const c = isMain ? i : 8 - i
          if (Grid.getCell(grid, r, c) === 0) gapCells.push([r, c])
        }
        if (gapCells.length > 0 && gapCells.length <= 2) paint(gapCells, gapCells.length)
      }
    }
  }

  private drawEmptyCell(row: number, col: number, fill: string): void {
    const pad = 1.8
    const x = col * this.cellSize + pad
    const y = row * this.cellSize + pad
    const size = this.cellSize - pad * 2
    if (size <= 0) return

    this.ctx.fillStyle = fill
    this.ctx.fillRect(x, y, size, size)

    if (this.tier?.id === 5) {
      this.ctx.strokeStyle = 'rgba(138,61,255,0.28)'
      this.ctx.lineWidth = 1
      this.ctx.setLineDash([])
      this.ctx.strokeRect(x, y, size, size)
    }
  }

  private drawGhostCell(row: number, col: number, valid: boolean, color?: string): void {
    const pad = 1
    const x = col * this.cellSize + pad
    const y = row * this.cellSize + pad
    const size = this.cellSize - pad * 2
    if (size <= 0) return

    if (valid && color) {
      // Render as the real piece at 75% opacity — player sees exactly what
      // they're placing, using the same tier-styled cell as placed blocks.
      this.ctx.globalAlpha = 0.75
      this.drawCellForTier(row, col, color, this.tier?.id ?? 0, 0)
      this.ctx.globalAlpha = 1.0
    } else if (valid) {
      // Fallback when no color provided: accent tint
      const accent = this.tier?.accent ?? '#8cff3c'
      const r = parseInt(accent.slice(1, 3), 16)
      const g = parseInt(accent.slice(3, 5), 16)
      const b = parseInt(accent.slice(5, 7), 16)
      this.ctx.fillStyle = `rgba(${r},${g},${b},0.45)`
      this.ctx.fillRect(x, y, size, size)
      this.ctx.strokeStyle = `rgba(${r},${g},${b},0.95)`
      this.ctx.lineWidth = 2
      this.ctx.setLineDash([])
      this.ctx.strokeRect(x + 1, y + 1, size - 2, size - 2)
    } else {
      // Invalid placement: red dashed overlay
      this.ctx.fillStyle = 'rgba(255, 55, 55, 0.32)'
      this.ctx.fillRect(x, y, size, size)
      this.ctx.strokeStyle = 'rgba(220, 30, 30, 0.75)'
      this.ctx.lineWidth = 2
      this.ctx.setLineDash([4, 3])
      this.ctx.strokeRect(x, y, size, size)
      this.ctx.setLineDash([])
    }
  }

  getCellSize(): number {
    return this.cellSize
  }

  resize(gridSize: number): void {
    this.gridSize = gridSize
    this.cellSize = gridSize / 9
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
}

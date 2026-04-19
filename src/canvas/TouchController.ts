import { GridRenderer } from './GridRenderer'
import { PieceRenderer } from './PieceRenderer'
import type { ShapeDefinition } from '../engine/shapes'
import { Grid } from '../engine/grid'

export class TouchController {
  private canvas: HTMLCanvasElement
  private gridRenderer: GridRenderer
  private pieceRenderer: PieceRenderer
  private onPlace: (pieceIndex: number, row: number, col: number) => void
  private canPlace: (shape: ShapeDefinition, row: number, col: number) => boolean

  private isDragging: boolean = false
  private dragIndex: number | null = null
  private dragPos: { x: number; y: number } = { x: 0, y: 0 }
  private ghostPos: { row: number; col: number } | null = null
  private destroyed: boolean = false
  private hoverIndex: number | null = null
  private onHoverChange?: (index: number | null) => void

  constructor(
    canvas: HTMLCanvasElement,
    gridRenderer: GridRenderer,
    pieceRenderer: PieceRenderer,
    onPlace: (pieceIndex: number, row: number, col: number) => void,
    canPlace: (shape: ShapeDefinition, row: number, col: number) => boolean,
    onHoverChange?: (index: number | null) => void
  ) {
    this.canvas = canvas
    this.gridRenderer = gridRenderer
    this.pieceRenderer = pieceRenderer
    this.onPlace = onPlace
    this.canPlace = canPlace
    this.onHoverChange = onHoverChange

    this.initEvents()
  }

  private initEvents() {
    this.canvas.addEventListener('mousedown', this.handleStart.bind(this))
    this.canvas.addEventListener('mousemove', this.handleMove.bind(this))
    this.canvas.addEventListener('mouseleave', () => {
      if (!this.isDragging && this.hoverIndex !== null) {
        this.hoverIndex = null
        this.onHoverChange?.(null)
      }
    })
    window.addEventListener('mouseup', this.handleEnd.bind(this))

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      this.handleStart(e.touches[0] as any)
    }, { passive: false })
    
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault()
      this.handleMove(e.touches[0] as any)
    }, { passive: false })
    
    window.addEventListener('touchend', (e) => {
      this.handleEnd(e.changedTouches[0] as any)
    })
  }

  destroy(): void {
    this.destroyed = true
    this.isDragging = false
    this.dragIndex = null
    this.hoverIndex = null
    this.onHoverChange?.(null)
    ;(window as any).activeGhost = null
  }

  private handleStart(e: MouseEvent | Touch) {
    if (this.destroyed) return
    const rect = this.canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (this.canvas.width / rect.width)
    const y = (e.clientY - rect.top) * (this.canvas.height / rect.height)

    // @ts-ignore - access to internal pieces from tray
    const pieces = (window as any).currentPieces || []
    const index = this.pieceRenderer.hitTestTray(x, y, pieces)

    if (index !== null) {
      this.isDragging = true
      this.dragIndex = index
      this.dragPos = { x, y }
      this.hoverIndex = null
      this.onHoverChange?.(null)
    }
  }

  private handleMove(e: MouseEvent | Touch) {
    const rect = this.canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (this.canvas.width / rect.width)
    const y = (e.clientY - rect.top) * (this.canvas.height / rect.height)

    if (this.destroyed) return

    if (!this.isDragging || this.dragIndex === null) {
      const pieces = (window as any).currentPieces || []
      const hovered = this.pieceRenderer.hitTestTray(x, y, pieces)
      if (hovered !== this.hoverIndex) {
        this.hoverIndex = hovered
        this.onHoverChange?.(hovered)
      }
      return
    }

    this.dragPos = { x, y }

    // Offset for ghost prediction (above finger)
    // Pass raw client coordinates to screenToGrid which handles its own rect subtraction
    const ghostGridPos = this.gridRenderer.screenToGrid(e.clientX, e.clientY - 40)
    
    if (ghostGridPos) {
      const shape = (window as any).currentPieces[this.dragIndex]
      if (!shape) {
        this.ghostPos = null;
        ;(window as any).activeGhost = null;
        return;
      }
      const isValid = this.canPlace(shape, ghostGridPos.row, ghostGridPos.col)
      this.ghostPos = ghostGridPos;
      
      // Update ghost in renderer
      // We pass it to the state management layer usually, but for MVP we hit renderer direct
      ;(window as any).activeGhost = { ...ghostGridPos, valid: isValid }
    } else {
      this.ghostPos = null;
      ;(window as any).activeGhost = null;
    }
  }

  private handleEnd(e: MouseEvent | Touch) {
    if (this.destroyed || !this.isDragging || this.dragIndex === null) return

    if (this.ghostPos) {
      // @ts-ignore
      const shape = (window as any).currentPieces[this.dragIndex]
      if (shape && this.canPlace(shape, this.ghostPos.row, this.ghostPos.col)) {
        this.onPlace(this.dragIndex, this.ghostPos.row, this.ghostPos.col)
      }
    }

    this.isDragging = false
    this.dragIndex = null
    this.ghostPos = null
    this.hoverIndex = null
    this.onHoverChange?.(null)
    // @ts-ignore
    window.activeGhost = null
  }

  getDragState() {
    return {
      isDragging: this.isDragging,
      dragIndex: this.dragIndex,
      dragPos: this.dragPos
    }
  }
}

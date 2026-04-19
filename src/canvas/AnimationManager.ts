export type AnimationType = 'LINE_CLEAR' | 'COMBO' | 'SCORE' | 'SNAP'

interface Animation {
  type: AnimationType
  progress: number // 0 to 1
  duration: number
  params: any
}

const getThemeColor = (name: string, fallback: string) => 
  typeof window !== 'undefined' ? (getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback) : fallback

export class AnimationManager {
  private animations: Animation[] = []

  trigger(type: AnimationType, params: any): void {
    const duration = type === 'COMBO' ? 800 : type === 'LINE_CLEAR' ? 500 : 300
    this.animations.push({ type, progress: 0, duration, params })
  }

  update(deltaTime: number): void {
    this.animations.forEach((anim) => {
      anim.progress += deltaTime / anim.duration
    })
    this.animations = this.animations.filter((anim) => anim.progress < 1)
  }

  draw(
    ctx: CanvasRenderingContext2D,
    cellSize: number,
    isTournament: boolean = false
  ): void {
    this.animations.forEach((anim) => {
      ctx.save()
      if (anim.type === 'LINE_CLEAR') {
        const { rows, cols } = anim.params
        ctx.fillStyle = isTournament
          ? `rgba(255, 184, 214, ${0.45 * (1 - anim.progress)})`
          : `rgba(183, 255, 59, ${0.45 * (1 - anim.progress)})`

        rows?.forEach((r: number) => {
          ctx.fillRect(0, r * cellSize, 9 * cellSize, cellSize)
          
          // Draw "CLEAR!" sticker at the start of each row
          if (anim.progress < 0.6) {
            const inkColor = getThemeColor('--ink', '#0C0C10')
            const limeColor = getThemeColor('--accent-lime', '#B7FF3B')
            ctx.save()
            ctx.translate(cellSize * 1.5, r * cellSize + cellSize / 2)
            ctx.rotate(-0.1)
            ctx.fillStyle = inkColor
            ctx.fillRect(-45, -18, 90, 36)
            ctx.strokeStyle = limeColor
            ctx.lineWidth = 3
            ctx.strokeRect(-45, -18, 90, 36)
            ctx.fillStyle = limeColor
            ctx.font = 'bold 16px "Archivo Black"'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText('CLEAR!', 0, 0)
            ctx.restore()
          }
        })
        cols?.forEach((c: number) => {
          ctx.fillRect(c * cellSize, 0, cellSize, 9 * cellSize)
        })
      } else if (anim.type === 'SCORE') {
        const { x, y, score } = anim.params
        const inkColor = getThemeColor('--ink', '#0C0C10')
        ctx.fillStyle = isTournament ? getThemeColor('--accent-cyan', '#8CEEF0') : inkColor
        ctx.globalAlpha = 1 - anim.progress
        ctx.font = '22px "Archivo Black"'
        ctx.shadowColor = 'rgba(0,0,0,0.3)'
        ctx.shadowBlur = 4
        ctx.fillText(`+${score}`, x, y - anim.progress * 60)
      } else if (anim.type === 'COMBO') {
        const { streak } = anim.params
        const center = ctx.canvas.width / 2
        
        // Sunburst/Flash effect
        if (anim.progress < 0.5) {
          ctx.fillStyle = `rgba(255, 213, 31, ${0.2 * (1 - anim.progress * 2)})`
          ctx.beginPath()
          ctx.arc(center, ctx.canvas.height / 2, anim.progress * 800, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.textAlign = 'center'
        const pinkColor = getThemeColor('--accent-pink', '#FF3BBD')
        const redColor = getThemeColor('--danger', '#FF3D3D')
        const inkColor = getThemeColor('--ink', '#0C0C10')

        ctx.fillStyle = isTournament ? pinkColor : redColor
        ctx.strokeStyle = inkColor
        ctx.lineWidth = 8
        const scale = 1 + Math.sin(anim.progress * Math.PI) * 0.2
        ctx.font = `${Math.floor(48 * scale)}px "Archivo Black"`
        
        const yPos = ctx.canvas.height / 2 - anim.progress * 150
        const text = `COMBO!`
        ctx.strokeText(text, center, yPos)
        ctx.fillText(text, center, yPos)
        
        // Subtext xN
        ctx.font = `${Math.floor(28 * scale)}px "Archivo Black"`
        ctx.fillStyle = isTournament ? getThemeColor('--accent-lime', '#B7FF3B') : getThemeColor('--accent-yellow', '#FFD51F')
        ctx.strokeText(`x${streak}`, center, yPos + 40)
        ctx.fillText(`x${streak}`, center, yPos + 40)
      }
      ctx.restore()
    })
  }
}

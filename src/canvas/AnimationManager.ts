export type AnimationType = 'LINE_CLEAR' | 'COMBO' | 'SCORE' | 'SNAP'

interface Animation {
  type: AnimationType
  progress: number // 0 to 1
  duration: number
  params: any
}

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

  draw(ctx: CanvasRenderingContext2D, cellSize: number): void {
    this.animations.forEach((anim) => {
      ctx.save()
      if (anim.type === 'LINE_CLEAR') {
        const { rows, cols } = anim.params
        ctx.fillStyle = `rgba(255, 255, 255, ${1 - anim.progress})`
        rows?.forEach((r: number) => ctx.fillRect(0, r * cellSize, 9 * cellSize, cellSize))
        cols?.forEach((c: number) => ctx.fillRect(c * cellSize, 0, cellSize, 9 * cellSize))
      } else if (anim.type === 'SCORE') {
        const { x, y, score } = anim.params
        ctx.fillStyle = `rgba(255, 255, 255, ${1 - anim.progress})`
        ctx.font = 'bold 20px Inter'
        ctx.fillText(`+${score}`, x, y - anim.progress * 50)
      } else if (anim.type === 'COMBO') {
        const { streak } = anim.params
        ctx.textAlign = 'center'
        ctx.fillStyle = `rgba(170, 59, 255, ${1 - anim.progress})`
        ctx.font = `bold ${24 + anim.progress * 20}px Inter`
        ctx.fillText(`COMBO x${streak}!`, ctx.canvas.width / 2, ctx.canvas.height / 2 - anim.progress * 100)
      }
      ctx.restore()
    })
  }
}

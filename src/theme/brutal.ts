export const INK = 'var(--ink)'
export const PAPER = 'var(--paper)'

export const PALETTE = {
  ink: INK,
  paper: {
    default: PAPER,
    lime: 'var(--paper-lime)',
    pink: 'var(--paper-pink)',
    cyan: 'var(--paper-cyan)',
    purple: 'var(--paper-purple)',
    white: 'var(--paper-2)',
  },
  piece: {
    red: 'var(--piece-red)',
    orange: 'var(--piece-orange)',
    yellow: 'var(--piece-yellow)',
    lime: 'var(--piece-lime)',
    green: 'var(--piece-green)',
    cyan: 'var(--piece-cyan)',
    blue: 'var(--piece-blue)',
    purple: 'var(--piece-purple)',
    pink: 'var(--piece-pink)',
  },
} as const

export const TYPOGRAPHY = {
  display: '"Archivo Black", sans-serif',
  body: '"Space Grotesk", sans-serif',
  labelSpacing: '0.14em',
  scoreTracking: '-0.03em',
} as const

export const BORDER = `3px solid ${INK}`
export const BORDER_THICK = `4px solid ${INK}`
export const INNER_BORDER = `2px solid ${PAPER}`

export const shadow = (x = 6, y = 6, color = INK) => `${x}px ${y}px 0 ${color}`

export const brutalSurface = (
  background: string,
  x = 6,
  y = 6,
  border = BORDER
) => ({
  background,
  border,
  borderRadius: 0,
  boxShadow: shadow(x, y),
})

export const pressedSurface = {
  transform: 'translate(3px, 3px)',
  boxShadow: shadow(3, 3),
}

export const activeSurface = {
  transform: 'translate(6px, 6px)',
  boxShadow: shadow(0, 0),
}

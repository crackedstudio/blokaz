/**
 * BLOCK FX — the tetromino motif, as a reusable decoration kit.
 *
 * Blokaz is a block puzzle, so its pieces are the one ornament the product can
 * wear everywhere without looking arbitrary. This module is the single source
 * of that motif: the falling blocks first built into the lobby's PLAY card,
 * plus the quieter variants that suit a whole page or a modal header.
 *
 * Rules for everything in here:
 *   · Decoration only. Never carries information, always `aria-hidden`, always
 *     `pointer-events-none` — a block must never eat a click.
 *   · Animation is transform/opacity only, so it stays off the layout path.
 *   · Counts stay low and are capped. A page backdrop is static by default;
 *     motion is reserved for small, deliberate surfaces.
 *   · Nothing here runs during gameplay. The board is the thing that should be
 *     moving on a game screen, not the wallpaper.
 *
 * Keyframes live in styles/utilities.css so every screen can use these without
 * each one shipping its own <style> block.
 */

import React, { useMemo } from 'react'

/** The piece palette, as CSS custom properties. */
const PIECE_COLOURS = [
  'var(--piece-red)',
  'var(--piece-orange)',
  'var(--piece-yellow)',
  'var(--piece-lime)',
  'var(--piece-green)',
  'var(--piece-cyan)',
  'var(--piece-blue)',
  'var(--piece-purple)',
  'var(--piece-pink)',
] as const

/**
 * Deterministic pseudo-random from a seed, so a decoration renders identically
 * across re-renders and between server and client. Math.random() here would
 * make blocks jump on every state change.
 */
function seeded(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 10000) / 10000
  }
}

const shell: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
}

// ── Falling blocks ───────────────────────────────────────────────────────────

interface BlockRainProps {
  /** How many blocks fall. Kept small — this is texture, not weather. */
  count?: number
  /** Horizontal band the blocks fall through, as percentages. */
  from?: number
  to?: number
  /** Distance a block travels, in px. Set it past the surface's height. */
  distance?: number
  /** Seconds for one fall, before per-block variation. */
  speed?: number
  size?: [number, number]
  seed?: number
  opacity?: number
  className?: string
}

/**
 * Tetromino cells falling and tumbling through a surface. Built for the hero
 * card — give the surface `position: relative` and let it clip them.
 */
export const BlockRain: React.FC<BlockRainProps> = ({
  count = 4,
  from = 55,
  to = 95,
  distance = 240,
  speed = 6,
  size = [22, 34],
  seed = 7,
  opacity = 0.9,
  className = '',
}) => {
  const blocks = useMemo(() => {
    const rand = seeded(seed)
    const n = Math.max(1, Math.min(count, 12))
    return Array.from({ length: n }, (_, i) => {
      const span = to - from
      return {
        id: i,
        left: from + (span / n) * i + rand() * (span / n) * 0.6,
        size: size[0] + rand() * (size[1] - size[0]),
        colour: PIECE_COLOURS[Math.floor(rand() * PIECE_COLOURS.length)],
        duration: speed * (0.75 + rand() * 0.7),
        delay: rand() * speed,
        spin: rand() > 0.5 ? 90 : -90,
      }
    })
  }, [count, from, to, speed, size, seed])

  return (
    <div style={shell} className={className} aria-hidden="true">
      {blocks.map((b) => (
        <span
          key={b.id}
          className="blockfx-fall absolute top-0 border-[3px] border-ink"
          style={
            {
              left: `${b.left}%`,
              width: b.size,
              height: b.size,
              background: b.colour,
              // The keyframe animates opacity, so an inline value would be
              // overridden mid-flight — it has to go in as the custom property
              // the keyframe reads.
              '--blockfx-opacity': opacity,
              '--blockfx-distance': `${distance}px`,
              '--blockfx-spin': `${b.spin}deg`,
              animationDuration: `${b.duration}s`,
              animationDelay: `${b.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

// ── Scattered field ──────────────────────────────────────────────────────────

interface BlockFieldProps {
  count?: number
  seed?: number
  /** Static by default — a page-sized field of animated blocks is a lot to paint. */
  drift?: boolean
  opacity?: number
  size?: [number, number]
  className?: string
}

/**
 * Blocks scattered across a whole surface, sitting still. This is the page
 * backdrop variant: cheap, quiet, and it makes an empty area below the content
 * read as part of the board rather than as dead space.
 */
export const BlockField: React.FC<BlockFieldProps> = ({
  count = 14,
  seed = 21,
  drift = false,
  opacity = 0.16,
  size = [18, 46],
  className = '',
}) => {
  const blocks = useMemo(() => {
    const rand = seeded(seed)
    const n = Math.max(1, Math.min(count, 30))
    return Array.from({ length: n }, (_, i) => ({
      id: i,
      left: rand() * 96,
      top: rand() * 94,
      size: size[0] + rand() * (size[1] - size[0]),
      colour: PIECE_COLOURS[Math.floor(rand() * PIECE_COLOURS.length)],
      rotate: -20 + rand() * 40,
      duration: 7 + rand() * 8,
      delay: rand() * 6,
    }))
  }, [count, seed, size])

  return (
    <div style={{ ...shell, position: 'fixed', zIndex: 0 }} className={className} aria-hidden="true">
      {blocks.map((b) => (
        <span
          key={b.id}
          className={`absolute border-[3px] border-ink ${drift ? 'blockfx-drift' : ''}`}
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: b.size,
            height: b.size,
            background: b.colour,
            opacity,
            transform: `rotate(${b.rotate}deg)`,
            animationDuration: drift ? `${b.duration}s` : undefined,
            animationDelay: drift ? `${b.delay}s` : undefined,
          }}
        />
      ))}
    </div>
  )
}

// ── Cell grid ────────────────────────────────────────────────────────────────

/**
 * The 9×9 board's cell lines, as a backdrop. Pure CSS gradient — no DOM nodes,
 * so it costs nothing to put behind a whole page.
 */
export const BlockGrid: React.FC<{ size?: number; className?: string }> = ({
  size = 44,
  className = '',
}) => (
  <div
    className={className}
    aria-hidden="true"
    style={{
      ...shell,
      position: 'fixed',
      zIndex: 0,
      backgroundImage:
        'linear-gradient(var(--dot) 1px, transparent 1px), linear-gradient(90deg, var(--dot) 1px, transparent 1px)',
      backgroundSize: `${size}px ${size}px`,
    }}
  />
)

// ── Cluster ──────────────────────────────────────────────────────────────────

/**
 * A stack of four cells in a tetromino silhouette. Small enough for a modal
 * header or a section corner, where a full field would be too much.
 */
export const BlockCluster: React.FC<{
  cell?: number
  colours?: readonly string[]
  className?: string
}> = ({
  cell = 9,
  colours = ['var(--piece-yellow)', 'var(--piece-cyan)', 'var(--piece-lime)', 'var(--piece-purple)'],
  className = '',
}) => {
  // An S-piece: two over, two under and offset.
  const cells: Array<[number, number]> = [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ]
  return (
    <span
      className={`relative inline-block shrink-0 ${className}`}
      aria-hidden="true"
      style={{ width: cell * 3, height: cell * 2 }}
    >
      {cells.map(([x, y], i) => (
        <span
          key={`${x}-${y}`}
          className="absolute border-[2px] border-ink"
          style={{
            left: x * cell,
            top: y * cell,
            width: cell,
            height: cell,
            background: colours[i % colours.length],
          }}
        />
      ))}
    </span>
  )
}

// ── Rule ─────────────────────────────────────────────────────────────────────

/**
 * A cleared line, used as a divider: a run of cells where a few are filled.
 * Replaces a plain 2px rule where a section break can afford some personality.
 */
export const BlockRule: React.FC<{
  cells?: number
  filled?: number[]
  cell?: number
  className?: string
}> = ({ cells = 12, filled = [2, 3, 7, 10], cell = 10, className = '' }) => (
  <div className={`flex gap-[3px] ${className}`} aria-hidden="true">
    {Array.from({ length: cells }, (_, i) => (
      <span
        key={i}
        className="border-[2px] border-ink"
        style={{
          width: cell,
          height: cell,
          background: filled.includes(i)
            ? PIECE_COLOURS[i % PIECE_COLOURS.length]
            : 'transparent',
          opacity: filled.includes(i) ? 0.9 : 0.35,
        }}
      />
    ))}
  </div>
)

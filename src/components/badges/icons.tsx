/**
 * Badge artwork — ported from the Claude Design project "Blokaz Badge System"
 * (badges.jsx). Each icon is a 48×48 viewBox drawn in ink linework over the
 * badge's accent fill, so one drawing works on every ground.
 *
 * The ladder set exists to solve a constraint the palette creates: twelve
 * badges share only six accents (L5/L7 cyan, L2/L8 pink, L1/L12 yellow) and
 * all twelve appear together in one scrolling list. Colour therefore cannot
 * carry identity — the silhouette and internal symbol have to.
 */

import React from 'react'

/** Fixed near-black. Linework never follows the theme: the accents don't either. */
export const BADGE_INK = '#0c0c10'

type IconFn = (fg: string) => React.ReactElement

const svg = (children: React.ReactNode): React.ReactElement => (
  <svg viewBox="0 0 48 48" width="100%" height="100%">{children}</svg>
)

// ── Weekly ladder · one per level ────────────────────────────────────────────

export const LADDER_ICONS: Record<number, IconFn> = {
  // PAPER CADET — dog-ear fold + rank chevrons. Flat and plain: first rung.
  1: (fg) => svg(<>
    <path d="M10 8h20l8 8v24H10z" fill={fg} stroke={BADGE_INK} strokeWidth="2.6" strokeLinejoin="miter" />
    <path d="M30 8v8h8z" fill="none" stroke={BADGE_INK} strokeWidth="2.2" />
    <path d="M15 34l7-6 7 6M15 40l7-6 7 6" stroke={BADGE_INK} strokeWidth="2.4" fill="none" strokeLinecap="square" />
  </>),

  // STICKER SCOUT — diamond sticker, perforated edge, star.
  2: (fg) => svg(<>
    <path d="M24 5l19 19-19 19-19-19z" fill={fg} stroke={BADGE_INK} strokeWidth="2.6" strokeLinejoin="miter" />
    {Array.from({ length: 12 }).map((_, i) => {
      const a = (i / 12) * Math.PI * 2
      return <circle key={i} cx={24 + Math.cos(a) * 19} cy={24 + Math.sin(a) * 19} r="1.4" fill={BADGE_INK} />
    })}
    <path d="M24 16l3 7h7l-5.5 4.5 2 7L24 30l-6.5 4.5 2-7L14 23h7z" fill={BADGE_INK} />
  </>),

  // STRIPED RUNNER — speed stripes + arrow chevrons.
  3: (fg) => svg(<>
    <rect x="6" y="6" width="36" height="36" fill={fg} stroke={BADGE_INK} strokeWidth="2.6" />
    <path d="M10 14l10-10M20 14l10-10M30 14l10-10" stroke={BADGE_INK} strokeWidth="3" strokeLinecap="square" />
    <path d="M13 32l11-11 11 11M15 40l9-9 9 9" stroke={BADGE_INK} strokeWidth="3" fill="none" strokeLinecap="square" strokeLinejoin="miter" />
  </>),

  // PIXEL BREAKER — shattering block cluster.
  4: (fg) => svg(<>
    <rect x="6" y="6" width="36" height="36" fill={fg} stroke={BADGE_INK} strokeWidth="2.6" />
    <rect x="12" y="12" width="10" height="10" fill={BADGE_INK} />
    <rect x="26" y="12" width="10" height="10" fill="#fff" stroke={BADGE_INK} strokeWidth="2" />
    <rect x="10" y="27" width="9" height="9" fill="#fff" stroke={BADGE_INK} strokeWidth="2" transform="rotate(-8 14 31)" />
    <rect x="27" y="26" width="11" height="11" fill={BADGE_INK} transform="rotate(6 32 31)" />
  </>),

  // NEON RIDER — bolt + motion trail. Sharp and electric, against L7's fluid.
  5: (fg) => svg(<>
    <rect x="6" y="6" width="36" height="36" fill={fg} stroke={BADGE_INK} strokeWidth="2.6" />
    <path d="M8 24h8M8 30h5" stroke={BADGE_INK} strokeWidth="2.6" strokeLinecap="square" />
    <path d="M27 8L16 26h8l-3 14 15-20h-9z" fill={BADGE_INK} />
  </>),

  // COSMIC DRIFTER — orbit ring, moon, specks.
  6: (fg) => svg(<>
    <rect x="6" y="6" width="36" height="36" fill={fg} stroke={BADGE_INK} strokeWidth="2.6" />
    <ellipse cx="24" cy="26" rx="15" ry="7" fill="none" stroke={BADGE_INK} strokeWidth="2.2" transform="rotate(-18 24 26)" />
    <circle cx="24" cy="18" r="6" fill={BADGE_INK} />
    <rect x="12" y="10" width="3" height="3" fill={BADGE_INK} transform="rotate(45 13.5 11.5)" />
    <rect x="34" y="34" width="3" height="3" fill={BADGE_INK} transform="rotate(45 35.5 35.5)" />
  </>),

  // LIQUID SURGE — stepped surge bars + droplet. Rising, against L5's strike.
  7: (fg) => svg(<>
    <rect x="6" y="6" width="36" height="36" fill={fg} stroke={BADGE_INK} strokeWidth="2.6" />
    <rect x="10" y="32" width="6" height="8" fill={BADGE_INK} />
    <rect x="18" y="26" width="6" height="14" fill={BADGE_INK} />
    <rect x="26" y="19" width="6" height="21" fill={BADGE_INK} />
    <path d="M34 8a5 6 0 1 0 0.1 0z" fill={BADGE_INK} />
  </>),

  // GLITCH WALKER — offset slabs, a figure coming apart.
  8: (fg) => svg(<>
    <rect x="6" y="6" width="36" height="36" fill={fg} stroke={BADGE_INK} strokeWidth="2.6" />
    <rect x="17" y="9" width="14" height="7" fill={BADGE_INK} transform="translate(-3,0)" />
    <rect x="15" y="18" width="18" height="9" fill={BADGE_INK} transform="translate(3,0)" />
    <rect x="17" y="29" width="14" height="9" fill={BADGE_INK} transform="translate(-2,0)" />
  </>),

  // VOID ARCHITECT — nested frames into a void, blueprint corner ticks.
  9: (fg) => svg(<>
    <rect x="6" y="6" width="36" height="36" fill={fg} stroke={BADGE_INK} strokeWidth="2.6" />
    <rect x="12" y="12" width="24" height="24" fill="none" stroke={BADGE_INK} strokeWidth="2" />
    <rect x="17" y="17" width="14" height="14" fill="none" stroke={BADGE_INK} strokeWidth="2" />
    <rect x="21" y="21" width="6" height="6" fill={BADGE_INK} />
    <path d="M6 12V6h6M42 6h-6v6M42 36v6h-6M6 36v6h6" stroke={BADGE_INK} strokeWidth="2" fill="none" />
  </>),

  // PRISM WARDEN — shield + faceted prism.
  10: (fg) => svg(<>
    <rect x="6" y="6" width="36" height="36" fill={fg} stroke={BADGE_INK} strokeWidth="2.6" />
    <path d="M24 9l12 4v10c0 8-6 12-12 15-6-3-12-7-12-15V13z" fill="none" stroke={BADGE_INK} strokeWidth="2.2" />
    <path d="M24 15l7 12h-14z" fill={BADGE_INK} />
    <path d="M24 15v12M17 27l7-12 7 12" stroke={fg} strokeWidth="1.6" />
  </>),

  // OBSIDIAN ORACLE — faceted eye.
  11: (fg) => svg(<>
    <rect x="6" y="6" width="36" height="36" fill={fg} stroke={BADGE_INK} strokeWidth="2.6" />
    <path d="M6 24c6-9 12-13 18-13s12 4 18 13c-6 9-12 13-18 13S12 33 6 24z" fill="none" stroke={BADGE_INK} strokeWidth="2.2" />
    <path d="M24 15l6 9-6 9-6-9z" fill={BADGE_INK} />
    <circle cx="24" cy="24" r="2.6" fill={fg} />
  </>),

  // BLOKAZ SOVEREIGN — tetromino crown. Ornate, against L1's plain page.
  12: (fg) => svg(<>
    <rect x="6" y="6" width="36" height="36" fill={fg} stroke={BADGE_INK} strokeWidth="2.6" />
    <rect x="10" y="28" width="28" height="7" fill={BADGE_INK} />
    <rect x="10" y="16" width="7" height="12" fill={BADGE_INK} />
    <rect x="20.5" y="10" width="7" height="18" fill={BADGE_INK} />
    <rect x="31" y="16" width="7" height="12" fill={BADGE_INK} />
    <rect x="21.5" y="6" width="5" height="5" fill={fg} stroke={BADGE_INK} strokeWidth="1.6" />
  </>),
}

// ── Achievements ────────────────────────────────────────────────────────────
// Keyed by the app's own achievement ids (engine/meta.ts), not the design
// file's shorthand, so nothing has to translate at the call site.

export const ACHIEVEMENT_ICONS: Record<string, IconFn> = {
  // FIRST BLOOD — one line clearing.
  first_clear: (fg) => svg(<>
    <rect x="8" y="20" width="32" height="7" fill={BADGE_INK} />
    <rect x="8" y="20" width="10" height="7" fill={fg} />
    <path d="M22 20l4-6 4 6" stroke={BADGE_INK} strokeWidth="2" fill="none" />
  </>),
  // FOUR FIGURES — a rising bar chart.
  score_1k: () => svg(<>
    <rect x="9" y="30" width="6" height="10" fill={BADGE_INK} />
    <rect x="18" y="22" width="6" height="18" fill={BADGE_INK} />
    <rect x="27" y="14" width="6" height="26" fill={BADGE_INK} />
    <path d="M9 12h12" stroke={BADGE_INK} strokeWidth="2.4" />
    <path d="M15 8v8" stroke={BADGE_INK} strokeWidth="2.4" />
  </>),
  // ON FIRE — flame.
  combo_5: () => svg(
    <path d="M24 8c4 6 10 10 10 18a10 10 0 1 1-20 0c0-4 2-6 4-9 0 4 2 5 3 5 0-6 0-10 3-14z" fill={BADGE_INK} />
  ),
  // REGULAR — a calendar with ticked days.
  games_25: () => svg(<>
    <rect x="9" y="12" width="30" height="26" fill="none" stroke={BADGE_INK} strokeWidth="2.4" />
    <path d="M9 19h30" stroke={BADGE_INK} strokeWidth="2.4" />
    {Array.from({ length: 7 }).map((_, i) => (
      <rect key={i} x={12 + i * 4} y={24} width="2.4" height="2.4" fill={BADGE_INK} />
    ))}
    <path d="M16 6v8M32 6v8" stroke={BADGE_INK} strokeWidth="2.4" strokeLinecap="square" />
  </>),
  // TRIPLE THREAT — three lines going at once.
  triple_clear: () => svg(<>
    <rect x="8" y="12" width="32" height="6" fill={BADGE_INK} />
    <rect x="8" y="21" width="32" height="6" fill={BADGE_INK} />
    <rect x="8" y="30" width="32" height="6" fill={BADGE_INK} />
  </>),
  // NEON NIGHTS — night disc with the bolt cut out of it.
  //
  // The design file drew a crescent as two arcs running between the same two
  // points in opposite winding directions, which cancels under the nonzero
  // fill rule — it rendered as an empty square. A crescent thin enough to sit
  // around a centred bolt also disappears at the 34px this ships at, so the
  // shape is a full disc and the bolt stays the cutout it was drawn as.
  score_10k: (fg) => svg(<>
    <path d="M24 24m-16 0a16 16 0 1 0 32 0a16 16 0 1 0-32 0Z" fill={BADGE_INK} />
    <path d="M27 20l-6 10h5l-2 8 9-11h-5z" fill={fg} />
  </>),
  // DEDICATED — a stopwatch.
  games_100: () => svg(<>
    <circle cx="24" cy="26" r="14" fill="none" stroke={BADGE_INK} strokeWidth="2.6" />
    <path d="M24 26V16M24 26l8 4" stroke={BADGE_INK} strokeWidth="2.6" strokeLinecap="square" />
    <rect x="19" y="6" width="10" height="4" fill={BADGE_INK} />
  </>),
  // DEMOLITION — a block blowing apart.
  lines_1000: () => svg(<>
    {Array.from({ length: 8 }).map((_, i) => {
      const a = (i / 8) * Math.PI * 2
      return <rect key={i} x={23 + Math.cos(a) * 12 - 2} y={24 + Math.sin(a) * 12 - 2} width="4" height="4" fill={BADGE_INK} />
    })}
    <rect x="19" y="20" width="10" height="10" fill={BADGE_INK} />
  </>),
  // COSMIC — a comet.
  score_20k: () => svg(<>
    <circle cx="30" cy="14" r="5" fill={BADGE_INK} />
    <path d="M27 17L10 38M23 15l-15 8M27 21l-19 4" stroke={BADGE_INK} strokeWidth="2" strokeLinecap="square" opacity="0.8" />
  </>),
  // LEGENDARY CHAIN — two interlocking links.
  combo_10: () => svg(<>
    <rect x="8" y="15" width="16" height="16" fill="none" stroke={BADGE_INK} strokeWidth="3.4" />
    <rect x="24" y="19" width="16" height="16" fill="none" stroke={BADGE_INK} strokeWidth="3.4" />
  </>),
}

/**
 * Accent per achievement. Presentation only — the game's achievement data
 * carries no colour, so the palette assignment lives with the artwork.
 * `split` is LEGENDARY CHAIN's two-tone diagonal.
 */
export const ACHIEVEMENT_ACCENTS: Record<string, string> = {
  first_clear: '#ff3d3d',
  score_1k: '#ff7a1a',
  combo_5: '#ffd51f',
  games_25: '#b7ff3b',
  triple_clear: '#2ce66a',
  score_10k: '#29e6e6',
  games_100: '#2f6bff',
  lines_1000: '#8a3dff',
  score_20k: '#ff3bbd',
  combo_10: 'split',
}

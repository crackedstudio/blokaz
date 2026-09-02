/**
 * Types for the server-side replay validator so the client-side parity test
 * (src/engine/__tests__/replayParity.test.ts) can import the real module rather
 * than a copy of it. The server itself is plain ESM JavaScript and does not
 * consume these.
 */

export type ReplayRulesVersion = 1 | 2

export interface ReplayVerdict {
  ok: boolean
  reason?: string
}

export declare function replayAndValidateScore(
  moves: unknown[],
  claimedScore: number,
  localSeed?: bigint,
  rulesVersion?: ReplayRulesVersion
): ReplayVerdict

/** Exported so the parity test can fuzz it against the client implementation. */
export declare function resolveGlitchMorph(
  grid: Uint8Array,
  shapeId: string,
  cellCount: number,
  row: number,
  col: number,
  seed: bigint,
  placementOrdinal: number
): { id: string; cellCount: number; colorId: number; cells: [number, number][] } | null

export declare const GLITCH_CHANCE: number

export declare const RULES: Record<
  ReplayRulesVersion,
  {
    placementSquared: boolean
    placementPerCell: number
    multiLine: [number, number, number]
    comboGrace: boolean
    boardAwareDealer: boolean
    tierMechanics: boolean
  }
>

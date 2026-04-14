import { TOTAL_WEIGHT } from './shapes'
import type { ShapeDefinition } from './shapes'

export class DeterministicRNG {
  private s0: bigint
  private s1: bigint

  constructor(seed: bigint) {
    // Ensure seed is treated as unsigned 64-bit
    this.s0 = seed & 0xffffffffffffffffn
    this.s1 = (seed ^ 0xdeadbeefcafen) & 0xffffffffffffffffn
    
    // Safety: if both are 0, xorshift state will never change
    if (this.s0 === 0n && this.s1 === 0n) {
      this.s1 = 0xdeadbeefcafen
    }
  }

  /**
   * Generates a deterministic float between [0, 1)
   */
  next(): number {
    let s1 = this.s0
    const s0 = this.s1
    this.s0 = s0
    s1 ^= (s1 << 23n) & 0xffffffffffffffffn
    s1 ^= (s1 >> 17n) & 0xffffffffffffffffn
    s1 ^= s0
    s1 ^= (s0 >> 26n) & 0xffffffffffffffffn
    this.s1 = s1 & 0xffffffffffffffffn
    
    // Use lower 32 bits for the float generation
    const sum = (this.s0 + this.s1) & 0xffffffffn
    return Number(sum) / 0x100000000
  }

  nextInt(max: number): number {
    return Math.floor(this.next() * max)
  }
}

export function selectShape(
  rng: DeterministicRNG,
  shapes: ShapeDefinition[]
): ShapeDefinition {
  const threshold = rng.next() * TOTAL_WEIGHT
  let accumulator = 0
  for (const shape of shapes) {
    accumulator += shape.spawnWeight
    if (threshold < accumulator) {
      return shape
    }
  }
  return shapes[shapes.length - 1] // Fallback
}

export function dealThree(
  rng: DeterministicRNG,
  shapes: ShapeDefinition[]
): [ShapeDefinition, ShapeDefinition, ShapeDefinition] {
  return [
    selectShape(rng, shapes),
    selectShape(rng, shapes),
    selectShape(rng, shapes),
  ]
}

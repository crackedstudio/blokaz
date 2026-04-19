export interface ShapeDefinition {
  id: string
  family: 'single' | 'line' | 'square' | 'L' | 'bigL' | 'T' | 'zigzag'
  cells: [number, number][] // row/col offsets from origin (0,0)
  width: number // bounding box width
  height: number // bounding box height
  cellCount: number // total filled cells
  spawnWeight: number // probability weight for RNG selection
  colorId: number // ID in COLOR_PALETTE (1-9)
}

export const SHAPES: ShapeDefinition[] = [
  // Singles & Dominoes
  {
    id: 'S1',
    family: 'single',
    cells: [[0, 0]],
    width: 1,
    height: 1,
    cellCount: 1,
    spawnWeight: 5,
    colorId: 1,
  },
  {
    id: 'D1',
    family: 'single',
    cells: [
      [0, 0],
      [0, 1],
    ],
    width: 2,
    height: 1,
    cellCount: 2,
    spawnWeight: 8,
    colorId: 1,
  },
  {
    id: 'D2',
    family: 'single',
    cells: [
      [0, 0],
      [1, 0],
    ],
    width: 1,
    height: 2,
    cellCount: 2,
    spawnWeight: 8,
    colorId: 1,
  },

  // Straight Lines
  {
    id: 'I3H',
    family: 'line',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
    width: 3,
    height: 1,
    cellCount: 3,
    spawnWeight: 10,
    colorId: 6,
  },
  {
    id: 'I3V',
    family: 'line',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    width: 1,
    height: 3,
    cellCount: 3,
    spawnWeight: 10,
    colorId: 6,
  },
  {
    id: 'I4H',
    family: 'line',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
    width: 4,
    height: 1,
    cellCount: 4,
    spawnWeight: 8,
    colorId: 6,
  },
  {
    id: 'I4V',
    family: 'line',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ],
    width: 1,
    height: 4,
    cellCount: 4,
    spawnWeight: 8,
    colorId: 6,
  },
  {
    id: 'I5H',
    family: 'line',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ],
    width: 5,
    height: 1,
    cellCount: 5,
    spawnWeight: 4,
    colorId: 6,
  },
  {
    id: 'I5V',
    family: 'line',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ],
    width: 1,
    height: 5,
    cellCount: 5,
    spawnWeight: 4,
    colorId: 6,
  },

  // Squares
  {
    id: 'O2',
    family: 'square',
    cells: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ],
    width: 2,
    height: 2,
    cellCount: 4,
    spawnWeight: 10,
    colorId: 3,
  },
  {
    id: 'O3',
    family: 'square',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 0],
      [2, 1],
      [2, 2],
    ],
    width: 3,
    height: 3,
    cellCount: 9,
    spawnWeight: 3,
    colorId: 3,
  },
  {
    id: 'O23',
    family: 'square',
    cells: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 0],
      [2, 1],
    ],
    width: 2,
    height: 3,
    cellCount: 6,
    spawnWeight: 6,
    colorId: 3,
  },

  // Small L-shapes
  {
    id: 'L2A',
    family: 'L',
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
    width: 2,
    height: 2,
    cellCount: 3,
    spawnWeight: 8,
    colorId: 2,
  },
  {
    id: 'L2B',
    family: 'L',
    cells: [
      [0, 0],
      [0, 1],
      [1, 0],
    ],
    width: 2,
    height: 2,
    cellCount: 3,
    spawnWeight: 8,
    colorId: 2,
  },
  {
    id: 'L2C',
    family: 'L',
    cells: [
      [0, 1],
      [1, 0],
      [1, 1],
    ],
    width: 2,
    height: 2,
    cellCount: 3,
    spawnWeight: 8,
    colorId: 2,
  },
  {
    id: 'L2D',
    family: 'L',
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
    ],
    width: 2,
    height: 2,
    cellCount: 3,
    spawnWeight: 8,
    colorId: 2,
  },

  // Large L-shapes
  {
    id: 'L3A',
    family: 'bigL',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
    ],
    width: 3,
    height: 3,
    cellCount: 5,
    spawnWeight: 5,
    colorId: 4,
  },
  {
    id: 'L3B',
    family: 'bigL',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
    ],
    width: 3,
    height: 2,
    cellCount: 4,
    spawnWeight: 5,
    colorId: 4,
  },
  {
    id: 'L3C',
    family: 'bigL',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
    ],
    width: 3,
    height: 2,
    cellCount: 4,
    spawnWeight: 5,
    colorId: 4,
  },
  {
    id: 'L3D',
    family: 'bigL',
    cells: [
      [0, 2],
      [1, 2],
      [2, 0],
      [2, 1],
      [2, 2],
    ],
    width: 3,
    height: 3,
    cellCount: 5,
    spawnWeight: 5,
    colorId: 4,
  },

  // T-shape
  {
    id: 'T1',
    family: 'T',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 1],
    ],
    width: 3,
    height: 2,
    cellCount: 4,
    spawnWeight: 6,
    colorId: 8,
  },

  // Zigzag
  {
    id: 'S1Z',
    family: 'zigzag',
    cells: [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
    ],
    width: 3,
    height: 2,
    cellCount: 4,
    spawnWeight: 6,
    colorId: 9,
  },
  {
    id: 'Z1Z',
    family: 'zigzag',
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
    width: 3,
    height: 2,
    cellCount: 4,
    spawnWeight: 6,
    colorId: 9,
  },
]

export const SHAPE_MAP: Record<string, ShapeDefinition> = SHAPES.reduce(
  (acc, shape) => {
    acc[shape.id] = shape
    return acc
  },
  {} as Record<string, ShapeDefinition>
)

export const TOTAL_WEIGHT: number = SHAPES.reduce(
  (sum, shape) => sum + shape.spawnWeight,
  0
)

import type { ShapeDefinition } from './shapes'

export interface ScoreEvent {
  basePoints: number // piece.cellCount
  linePoints: number // linesCleared * 90
  comboBonus: number // linesCleared * newCombo * 50
  totalPoints: number // sum of above
  linesCleared: number
  newComboStreak: number // updated streak value
}

export function calculateScore(
  piece: ShapeDefinition,
  linesCleared: number,
  currentComboStreak: number
): ScoreEvent {
  const basePoints = piece.cellCount
  const linePoints = linesCleared * 10 * 9 // 90 per line

  let newComboStreak = 0
  let comboBonus = 0

  if (linesCleared > 0) {
    newComboStreak = currentComboStreak + 1
    comboBonus = linesCleared * newComboStreak * 50
  } else {
    newComboStreak = 0
    comboBonus = 0
  }

  const totalPoints = basePoints + linePoints + comboBonus

  return {
    basePoints,
    linePoints,
    comboBonus,
    totalPoints,
    linesCleared,
    newComboStreak,
  }
}

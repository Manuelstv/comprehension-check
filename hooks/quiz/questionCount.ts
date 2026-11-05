// How many questions a quiz should have, from the settings and the change.

import { QUESTION_LIMITS, SIZE_STEPS } from '../config'
import { totalLines } from '../changes/changeTracker'
import type { Changes } from '../changes/changeTracker'
import type { Settings } from '../settings/settings'

export type QuestionCount =
  // Claude picks, from QUESTION_LIMITS.min up to `max`.
  | { mode: 'agent'; max: number }
  // The mod sets the count from the size of the change.
  | { mode: 'size'; exact: number; files: number; lines: number }

export type SizedCount = Extract<QuestionCount, { mode: 'size' }>

// The minimum, plus one for each size step reached, never above `max`.
export const questionsForSize = (files: number, lines: number, max: number): number => {
  const stepsReached = SIZE_STEPS.filter(step => files >= step.files || lines >= step.lines).length
  return Math.min(max, QUESTION_LIMITS.min + stepsReached)
}

export const questionCountFor = (settings: Settings, changes: Changes): QuestionCount => {
  if (settings.sizing === 'agent') return { mode: 'agent', max: settings.maxQuestions }
  const files = changes.size
  const lines = totalLines(changes)
  return { mode: 'size', exact: questionsForSize(files, lines, settings.maxQuestions), files, lines }
}

export const fitsQuestionCount = (count: QuestionCount, asked: number): boolean =>
  count.mode === 'size' ? asked === count.exact : asked <= count.max

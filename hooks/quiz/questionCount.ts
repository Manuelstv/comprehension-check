// How many questions a quiz should have, from the settings and the change,
// and whether a round of the quiz fits it. A quiz longer than one dialog holds
// (QUESTION_LIMITS.perDialog) is asked in rounds.

import { LINES_PER_QUESTION, QUESTION_LIMITS } from '../config'
import { totalLines } from '../changes/changeTracker'
import type { Changes } from '../changes/changeTracker'
import type { Settings } from '../settings/settings'

export type QuestionCount =
  // Claude weighs the change and picks 1 up to `max`.
  | { mode: 'agent'; max: number }
  // One question per LINES_PER_QUESTION changed lines, up to the max.
  | { mode: 'size'; exact: number; files: number; lines: number }

export type SizedCount = Extract<QuestionCount, { mode: 'size' }>

const { perDialog } = QUESTION_LIMITS

// 1 to 100 lines: 1 question; 101 to 200: 2; and so on, never above `max`.
export const questionsForSize = (lines: number, max: number): number =>
  Math.min(max, Math.max(1, Math.ceil(lines / LINES_PER_QUESTION)))

export const questionCountFor = (settings: Settings, changes: Changes): QuestionCount => {
  if (settings.sizing === 'agent') return { mode: 'agent', max: settings.maxQuestions }
  const lines = totalLines(changes)
  return { mode: 'size', exact: questionsForSize(lines, settings.maxQuestions), files: changes.size, lines }
}

const mostAllowed = (count: QuestionCount) => (count.mode === 'size' ? count.exact : count.max)

// True when the quiz may need more than one dialog.
export const mayNeedRounds = (count: QuestionCount): boolean => mostAllowed(count) > perDialog

// The questions the next round must have in size mode: a full dialog, or what
// is left.
export const nextRoundSize = (count: SizedCount, askedBefore: number): number =>
  Math.min(perDialog, count.exact - askedBefore)

// Whether a round of `asked` questions, after `askedBefore` in earlier rounds
// of the same quiz, fits the count.
export const fitsQuestionCount = (count: QuestionCount, asked: number, askedBefore = 0): boolean => {
  if (asked < 1 || asked > perDialog) return false
  if (count.mode === 'size') return asked === nextRoundSize(count, askedBefore)
  return askedBefore + asked <= count.max
}

// The quiz's length as the gate tells the user, when it is known: always in
// size mode; with Claude deciding, when no round can follow this first one.
export const knownQuizLength = (count: QuestionCount, firstRound: number): number | undefined => {
  if (count.mode === 'size') return count.exact
  return firstRound < perDialog || count.max === firstRound ? firstRound : undefined
}

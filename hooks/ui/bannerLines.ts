// The text of the banners above the gate and quiz dialogs, fitted to the
// rows the terminal leaves them. Pure: the drawing is in dialogBanners.tsx.

import { DIALOG_LAYOUT } from '../config'
import { baseName } from '../lib/text'

export type DialogQuestion = { header?: string; multiSelect?: boolean }

const rowsOf = (line: string) => 1 + Math.floor([...line].length / DIALOG_LAYOUT.rowColumns)

// Keeps the lines that fit in `room` rows, in order, the first always.
export const fitRows = (lines: readonly string[], room = DIALOG_LAYOUT.rows - 1): string[] => {
  const kept: string[] = []
  let used = 0
  for (const line of lines) {
    const rows = rowsOf(line)
    if (kept.length > 0 && used + rows > room) continue
    kept.push(line)
    used += rows
  }
  return kept
}

// "On: a.ts, b.ts (+3)", within one row.
export const fileListLine = (files: readonly string[]): string | undefined => {
  const names = [...new Set(files.map(baseName))]
  if (names.length === 0) return undefined
  let line = `On: ${names[0]}`
  let i = 1
  while (i < names.length && [...`${line}, ${names[i]} (+9)`].length < DIALOG_LAYOUT.rowColumns - 1) {
    line += `, ${names[i]}`
    i += 1
  }
  return i < names.length ? `${line} (+${names.length - i})` : line
}

export const gateBannerLines = (files: readonly string[], questions: number): string[] => {
  const fileLine = fileListLine(files)
  return fitRows([
    '🧠 COMPREHENSION CHECK',
    `${questions > 0 ? `${questions} questions` : 'A few questions'} · about a minute`,
    ...(fileLine === undefined ? [] : [fileLine]),
    'No hints. No penalty. You vs the diff.',
  ])
}

// The quiz banner: a title, one "how to answer" line per question, then tips.
// `howToCount` is how many of the returned lines after the title are how-to lines.
export const quizBannerLines = (questions: readonly DialogQuestion[]) => {
  const howTo = questions.map((q, i) => {
    const header = q.header ?? `Question ${i + 1}`
    return q.multiSelect === true ? `☑ Q${i + 1} ${header}: pick ALL that apply` : `◉ Q${i + 1} ${header}: pick one`
  })
  const lines = fitRows([
    `🧠 COMPREHENSION CHECK · ${questions.length} questions`,
    ...howTo,
    '✎ Other: answer in your own words',
    'No answer is marked. Esc skips.',
  ])
  return { lines, howToCount: howTo.length }
}

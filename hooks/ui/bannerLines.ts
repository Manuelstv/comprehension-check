// The text of the banners above the gate and quiz dialogs, fitted to the
// rows the terminal leaves them. Pure: the drawing is in dialogBanners.tsx.
//
// Each line is a list of segments, each with a role (`Tone`) rather than a
// color: the drawing maps roles to theme colors, so the words and their
// meaning are tested here and the look is decided in one place.

import { DIALOG_LAYOUT } from '../config'
import { baseName } from '../lib/text'

export type DialogQuestion = { header?: string; multiSelect?: boolean }

// What a segment is, which decides how it is drawn: `single` and `multi`
// tell the two answer formats apart at a glance; `alert` is the one word that
// must not be missed ("ALL"); `muted` is everything the eye can skip.
export type Tone = 'title' | 'strong' | 'single' | 'multi' | 'alert' | 'other' | 'accent' | 'plain' | 'muted'
export type Segment = { text: string; tone: Tone }
export type BannerLine = readonly Segment[]

const seg = (text: string, tone: Tone): Segment => ({ text, tone })

export const lineText = (line: BannerLine): string => line.map(part => part.text).join('')

const rowsOf = (line: string) => 1 + Math.floor([...line].length / DIALOG_LAYOUT.rowColumns)

// Keeps the lines that fit in `room` rows, in order, the first always.
export const fitRows = <L extends string | BannerLine>(lines: readonly L[], room = DIALOG_LAYOUT.rows - 1): L[] => {
  const kept: L[] = []
  let used = 0
  for (const line of lines) {
    const rows = rowsOf(typeof line === 'string' ? line : lineText(line))
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

export const gateBannerLines = (files: readonly string[], questions: number): BannerLine[] => {
  const fileLine = fileListLine(files)
  return fitRows<BannerLine>([
    [seg('🧠 COMPREHENSION CHECK', 'title')],
    [seg(questions > 0 ? `${questions} questions` : 'A few questions', 'strong'), seg(' · about a minute', 'muted')],
    ...(fileLine === undefined ? [] : [[seg('On: ', 'muted'), seg(fileLine.slice('On: '.length), 'plain')]]),
    [seg('No hints. No penalty. ', 'muted'), seg('You vs the diff.', 'accent')],
  ])
}

// One "how to answer" line: the format's mark in its color, the number, the
// header, then how to pick. "pick ALL" is the easy one to miss.
const howToLine = (q: DialogQuestion, i: number): BannerLine => {
  const header = q.header ?? `Question ${i + 1}`
  return q.multiSelect === true
    ? [seg('☑ ', 'multi'), seg(`Q${i + 1} `, 'strong'), seg(header, 'plain'), seg(' · ', 'muted'), seg('pick ALL', 'alert'), seg(' that apply', 'multi')]
    : [seg('◉ ', 'single'), seg(`Q${i + 1} `, 'strong'), seg(header, 'plain'), seg(' · ', 'muted'), seg('pick one', 'single')]
}

// The quiz banner: a title, one "how to answer" line per question, then tips.
export const quizBannerLines = (questions: readonly DialogQuestion[]): BannerLine[] =>
  fitRows<BannerLine>([
    [seg('🧠 COMPREHENSION CHECK', 'title'), seg(' · ', 'muted'), seg(`${questions.length} questions`, 'strong')],
    ...questions.map(howToLine),
    [seg('✎ ', 'other'), seg('Other', 'strong'), seg(': answer in your own words', 'muted')],
    [seg('No answer is marked. Esc skips.', 'muted')],
  ])

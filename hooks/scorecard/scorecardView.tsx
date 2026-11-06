// The scorecard, drawn in place of the results tool's own row, and the hint
// drawn under it instead of the text the model read.
//
// Built to teach, not only to score: the bar shows which questions went
// wrong, a miss sets the user's answer against the right one, a right answer
// stays short, and a real bug the quiz found in the change stands out.

import type { On } from 'claude-code'

import { COMMAND_NAME, CONFETTI, RESULTS_TOOL, SCORECARD, VERDICTS } from '../config'
import type { Verdict } from '../config'
import { pickStable } from '../lib/text'
import { readCardStats, readCountUp } from './scorecardState'
import { findingsOf, parseResults, scoreOf, tierFor } from './grading'
import type { GradedQuestion } from './grading'
import { statsLine } from './stats'

const easeOut = (t: number) => 1 - (1 - t) ** 3

const widthWithin = (columns: number, size: { min: number; max: number; reserved: number }) =>
  Math.max(size.min, Math.min(size.max, columns - size.reserved))

const confettiRow = (width: number, frame: number) =>
  Array.from({ length: width }, (_, i) => ({
    glyph: CONFETTI.glyphs[(i * 3 + frame) % CONFETTI.glyphs.length] as string,
    color: CONFETTI.colors[(i + frame) % CONFETTI.colors.length] as string,
  }))

// One run of cells per question, in its verdict's color, so the bar reads as
// a map of the quiz: Q1 ▓▓▓ Q2 ███ Q3 ░░░. Runs are split by a space when
// the bar has room for one. Each run is at least one cell, so a long quiz
// widens the bar rather than losing a question. Pure.
export type BarCell = { glyph: string; verdict: Verdict } | { glyph: ' ' }

export const verdictBar = (verdicts: readonly Verdict[], width: number): BarCell[] => {
  const n = verdicts.length
  const gap = n > 1 && width >= n * 3 ? 1 : 0
  const room = Math.max(n, width - gap * (n - 1))
  const base = Math.floor(room / n)
  const extra = room - base * n
  return verdicts.flatMap((verdict, i) => [
    ...(i > 0 && gap > 0 ? [{ glyph: ' ' } as const] : []),
    ...Array.from({ length: base + (i < extra ? 1 : 0) }, () => ({ glyph: VERDICTS[verdict].cell, verdict })),
  ])
}

export function registerScorecardView(on: On) {
  on('ui.render', { component: 'ToolResult', props: { tool: RESULTS_TOOL } }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>  ⎿ /{COMMAND_NAME} stats for your record</Text>
  })

  on('ui.render', { component: 'ToolUse', props: { tool: RESULTS_TOOL } }, async ($, e, next) => {
    const parsed = parseResults(e.props.input)
    if (parsed === undefined) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    const id = e.props.tool_use_id
    const { points, pct } = scoreOf(parsed.results)
    const tier = tierFor(pct)

    // The count-up in progress for this card, if any; a still card shows the full score.
    const countUp = await readCountUp($)
    const isCounting = countUp !== null && countUp.id === id
    const frame = isCounting ? countUp.frame : 0
    const progress = isCounting ? easeOut(Math.min(1, frame / SCORECARD.frames)) : 1
    const shownPct = Math.round(pct * progress)

    const columns = e.viewport?.columns ?? 80
    const bar = verdictBar(
      parsed.results.map(r => r.verdict),
      widthWithin(columns, SCORECARD.bar),
    )
    // The bar fills left to right as the score counts up.
    const revealed = Math.round(bar.length * progress)
    const confetti = pct >= SCORECARD.greatPct ? confettiRow(widthWithin(columns, SCORECARD.confetti), frame) : []
    const stats = await readCardStats($, id)
    const findings = findingsOf(parsed.results)

    // "◐ You   the answer", its text wrapping under itself, not under the label.
    const answerRow = (mark: string, label: string, color: string, text: string) => (
      <Box flexDirection="row">
        <Box width={9} flexShrink={0}>
          <Text color={color}>
            {mark} {label}
          </Text>
        </Box>
        <Box flexShrink={1}>
          <Text>{text}</Text>
        </Box>
      </Box>
    )

    const questionBody = (r: GradedQuestion) => {
      const style = VERDICTS[r.verdict]
      const isRight = r.verdict === 'correct'
      return (
        <Box flexDirection="column" paddingLeft={SCORECARD.indent}>
          {r.punchline !== '' && (
            <Text bold color={style.color}>
              {r.punchline}
            </Text>
          )}
          {/* A right answer needs no "you said": the user knows what they picked. */}
          {!isRight && r.user_answer !== undefined && answerRow(style.mark, 'You', style.color, r.user_answer)}
          {!isRight && r.correct_answer !== undefined && answerRow(VERDICTS.correct.mark, 'Answer', 'success', r.correct_answer)}
          {r.explanation !== '' && <Text dimColor={isRight}>{r.explanation}</Text>}
          {r.finding !== undefined && (
            <Text>
              <Text bold color="warning">
                ⚠ In the code:
              </Text>{' '}
              {r.finding}
            </Text>
          )}
          {r.ref !== undefined && <Text dimColor>↳ {r.ref}</Text>}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={tier.color} paddingX={1}>
        {confetti.length > 0 && (
          <Text>
            {confetti.map(c => (
              <Text color={c.color}>{c.glyph}</Text>
            ))}
          </Text>
        )}
        <Text>
          <Text bold>
            {tier.emoji} {String(shownPct).padStart(3)}%{' '}
          </Text>
          {bar.map((cell, i) =>
            !('verdict' in cell) ? (
              <Text> </Text>
            ) : i < revealed ? (
              <Text color={VERDICTS[cell.verdict].color}>{cell.glyph}</Text>
            ) : (
              <Text dimColor>·</Text>
            ),
          )}
          <Text dimColor>
            {' '}
            {points}/{parsed.results.length}
          </Text>
        </Text>
        <Text bold color={tier.color}>
          {pickStable(tier.lines, id)}
        </Text>
        {parsed.results.map((r, i) => {
          const style = VERDICTS[r.verdict]
          return (
            <Box flexDirection="column" marginTop={1}>
              <Text>
                {style.icon}{' '}
                <Text bold>
                  Q{i + 1} · {r.question}
                </Text>{' '}
                <Text color={style.color}>{style.word}</Text>
              </Text>
              {questionBody(r)}
            </Box>
          )
        })}
        {(findings.length > 0 || parsed.next_step !== undefined) && (
          <Box flexDirection="column" marginTop={1}>
            {findings.length > 0 && (
              <Text>
                <Text bold color="warning">
                  ⚠ {findings.length === 1 ? 'A real problem' : `${findings.length} real problems`} in the change
                </Text>{' '}
                (Q{findings.map(f => f.n).join(', Q')}). Ask Claude to fix {findings.length === 1 ? 'it' : 'them'}.
              </Text>
            )}
            {parsed.next_step !== undefined && (
              <Text>
                <Text bold color="claude">
                  ➜ Next:
                </Text>{' '}
                {parsed.next_step}
              </Text>
            )}
          </Box>
        )}
        {stats !== undefined && <Text dimColor>📈 {statsLine(stats)}</Text>}
      </Box>
    )
  })
}

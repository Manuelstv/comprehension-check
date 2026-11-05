// The scorecard, drawn in place of the results tool's own row, and the hint
// drawn under it instead of the text the model read.

import type { On } from 'claude-code'

import { COMMAND_NAME, CONFETTI, RESULTS_TOOL, SCORECARD, VERDICTS } from '../config'
import { pickStable } from '../lib/text'
import { readCardStats, readCountUp } from './scorecardState'
import { parseResults, scoreOf, tierFor } from './grading'
import { statsLine } from './stats'

const easeOut = (t: number) => 1 - (1 - t) ** 3

const widthWithin = (columns: number, size: { min: number; max: number; reserved: number }) =>
  Math.max(size.min, Math.min(size.max, columns - size.reserved))

const confettiRow = (width: number, frame: number) =>
  Array.from({ length: width }, (_, i) => ({
    glyph: CONFETTI.glyphs[(i * 3 + frame) % CONFETTI.glyphs.length] as string,
    color: CONFETTI.colors[(i + frame) % CONFETTI.colors.length] as string,
  }))

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
    const barWidth = widthWithin(columns, SCORECARD.bar)
    const filled = Math.round((barWidth * shownPct) / 100)
    const confetti = pct >= SCORECARD.greatPct ? confettiRow(widthWithin(columns, SCORECARD.confetti), frame) : []
    const stats = await readCardStats($, id)

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
          <Text color={tier.color}>{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(barWidth - filled)}</Text>
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
          const showAnswer = r.verdict !== 'correct' && r.correct_answer !== undefined
          return (
            <Box flexDirection="column" marginTop={1}>
              <Text>
                {style.icon}{' '}
                <Text bold>
                  Q{i + 1} · {r.question}
                </Text>{' '}
                <Text color={style.color}>{style.word}</Text>
              </Text>
              {r.punchline !== '' && (
                <Text bold color={style.color}>
                  {'   '}
                  {r.punchline}
                </Text>
              )}
              {(r.user_answer !== undefined || showAnswer) && (
                <Text dimColor>
                  {'   '}
                  {r.user_answer !== undefined ? `You said: ${r.user_answer}` : ''}
                  {r.user_answer !== undefined && showAnswer ? '  ·  ' : ''}
                  {showAnswer ? `Answer: ${r.correct_answer}` : ''}
                </Text>
              )}
              {r.explanation !== '' && <Text>   {r.explanation}</Text>}
              {r.ref !== undefined && <Text dimColor>   ↳ {r.ref}</Text>}
            </Box>
          )
        })}
        {parsed.next_step !== undefined && (
          <Box marginTop={1}>
            <Text>
              <Text bold color="claude">
                ➜ Next:
              </Text>{' '}
              {parsed.next_step}
            </Text>
          </Box>
        )}
        {stats !== undefined && <Text dimColor>📈 {statsLine(stats)}</Text>}
      </Box>
    )
  })
}

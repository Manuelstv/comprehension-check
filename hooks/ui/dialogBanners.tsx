// Banners above the two dialogs the mod owns: the yes/no gate and the quiz.
// Every other question dialog is drawn as the engine draws it.
//
// Each banner line is one Text of colored segments; what each segment is
// comes from bannerLines.ts and how it looks from BANNER_TONES.

import type { On } from 'claude-code'

import { BANNER_TONES, GATE, QUIZ_SOURCE } from '../config'
import { readGateInfo } from '../quiz/gateState'
import { gateBannerLines, quizBannerLines } from './bannerLines'
import type { BannerLine, DialogQuestion } from './bannerLines'

export function registerDialogBanners(on: On) {
  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const questions = (Array.isArray(e.props.questions) ? e.props.questions : []) as DialogQuestion[]
    const isGate = questions.length === 1 && questions[0]?.header === GATE.header
    const isQuiz = e.props.metadataSource === QUIZ_SOURCE
    if (!isGate && !isQuiz) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const engine = await next(e)
    const gate = isGate ? await readGateInfo($) : null
    const lines: BannerLine[] = isGate
      ? gateBannerLines(gate?.files ?? [], gate?.questions ?? 0)
      : quizBannerLines(questions)

    return (
      <Box flexDirection="column">
        {lines.map((line, i) => (
          <Text key={String(i)}>
            {line.map((part, j) => (
              <Text key={String(j)} {...BANNER_TONES[part.tone]}>
                {part.text}
              </Text>
            ))}
          </Text>
        ))}
        {engine}
      </Box>
    )
  })
}

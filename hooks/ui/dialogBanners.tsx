// Banners above the two dialogs the mod owns: the yes/no gate and the quiz.
// Every other question dialog is drawn as the engine draws it.

import type { On } from 'claude-code'

import { GATE, QUIZ_SOURCE } from '../config'
import { readGateInfo } from '../quiz/gateState'
import { gateBannerLines, quizBannerLines } from './bannerLines'
import type { DialogQuestion } from './bannerLines'

export function registerDialogBanners(on: On) {
  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const questions = (Array.isArray(e.props.questions) ? e.props.questions : []) as DialogQuestion[]
    const isGate = questions.length === 1 && questions[0]?.header === GATE.header
    const isQuiz = e.props.metadataSource === QUIZ_SOURCE
    if (!isGate && !isQuiz) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const engine = await next(e)

    if (isGate) {
      const info = await readGateInfo($)
      const lines = gateBannerLines(info?.files ?? [], info?.questions ?? 0)
      return (
        <Box flexDirection="column">
          {lines.map((line, i) =>
            i === 0 ? (
              <Text bold color="claude">
                {line}
              </Text>
            ) : (
              <Text dimColor>{line}</Text>
            ),
          )}
          {engine}
        </Box>
      )
    }

    const { lines, howToCount } = quizBannerLines(questions)
    return (
      <Box flexDirection="column">
        {lines.map((line, i) =>
          i === 0 ? (
            <Text bold color="claude">
              {line}
            </Text>
          ) : (
            <Text dimColor={i > howToCount}>{line}</Text>
          ),
        )}
        {engine}
      </Box>
    )
  })
}

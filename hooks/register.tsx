// The mod's entry point: creates the shared parts once and hands them to each
// feature. Every behavior lives in its own module:
//
//   quiz/        when to quiz: edits, reminders, the yes/no gate, the Stop fallback
//   changes/     what changed: files, line counts, lock and git-ignored files
//   settings/    the user's settings and the settings menu
//   scorecard/   the results tool, grading, stats and the scorecard drawing
//   ui/          the banners above the question dialogs
//   update/      /quiz version and /quiz update
//   commands/    the /quiz command
//   config.ts    every tunable value

import type { Register } from 'claude-code'

import { ChangeTracker } from './changes/changeTracker'
import { IgnoredFileCache } from './changes/ignoredFiles'
import { defineQuizCommand, registerQuizCommand } from './commands/quizCommand'
import { createOwnDialogs } from './quiz/ownDialogs'
import { registerQuizFlow } from './quiz/quizFlow'
import { QuizRounds } from './quiz/quizRounds'
import { TurnReminders } from './quiz/turnReminders'
import { defineResultsTool, registerResultsTool } from './scorecard/resultsTool'
import { registerScorecardView } from './scorecard/scorecardView'
import { registerDialogBanners } from './ui/dialogBanners'

export const register: Register = on => {
  const changes = new ChangeTracker()
  const rounds = new QuizRounds()
  const ownDialogs = createOwnDialogs()

  on('session.start', async ($, e, next) => {
    await defineQuizCommand($)
    await defineResultsTool($)
    return next(e)
  })

  registerQuizCommand(on, { changes, ownDialogs })
  registerResultsTool(on, rounds)
  registerQuizFlow(on, {
    changes,
    reminders: new TurnReminders(),
    rounds,
    ownDialogs,
    ignoredFiles: new IgnoredFileCache(),
  })
  registerScorecardView(on)
  registerDialogBanners(on)
}

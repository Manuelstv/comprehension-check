// `/quiz last [n]`, `/quiz uncommitted`, `/quiz codebase`: read the scope
// from git, size the quiz by the user's settings, and start a turn in which
// Claude asks it.
//
// The quiz instructions travel as the command's hidden `context`, recorded
// with its output, and a short prompt starts the quiz's turn, so the
// transcript shows "Quiz me on the last commit." and Claude reads the rest.
//
// The engine refuses a prompt submitted while a `command.run` hook is still
// running, and a local command has no turn around it (no turn.complete to
// wait for). So the prompt is submitted by a detached task, once the hook
// has returned.

import type { CommandRunResult, EngineInterface } from 'claude-code'

import { ON_DEMAND, PLUGIN_NAME } from '../config'
import { delay } from '../lib/timers'
import { requestedQuizNote } from '../quiz/prompts'
import { questionCountFor } from '../quiz/questionCount'
import type { QuizRequest } from '../quiz/quizRequest'
import { readSettings } from '../settings/settings'
import { collectScope } from './collectScope'
import { requestPrompt, requestSummary, subjectOf } from './scopeText'
import type { QuizScope } from './scopes'

type RequestHost = Pick<EngineInterface, 'process' | 'store' | 'prompt' | 'ui'>

// Submits the request's prompt once the command's hook has returned. If it
// never goes in, no quiz turn follows, so the request goes too; the reason is
// logged for `claude --debug`.
async function submitAfterCommand($: Pick<EngineInterface, 'prompt' | 'ui'>, request: QuizRequest) {
  await delay(ON_DEMAND.submitDelayMs)
  const prompt = request.takePrompt()
  if (prompt === undefined) return
  let refusal: string | undefined
  try {
    const submitted = await $.prompt.submit({ text: prompt })
    refusal = submitted.drop
  } catch (error) {
    refusal = String(error)
  }
  if (refusal === undefined) return
  request.close()
  $.ui.log(`${PLUGIN_NAME}: the quiz prompt did not go in: ${refusal}`, { to: 'debug' })
}

// Runs whether automatic quizzes are on or off: the user asked for this one.
export async function requestQuiz($: RequestHost, scope: QuizScope, request: QuizRequest): Promise<CommandRunResult> {
  const collected = await collectScope($, scope)
  if ('error' in collected) return { text: collected.error }

  const { snapshot } = collected
  const settings = await readSettings($)
  const count = questionCountFor(settings, snapshot.changes)
  request.open(snapshot.changes, requestPrompt(snapshot))
  void submitAfterCommand($, request)
  return {
    text: requestSummary(snapshot, count, settings),
    context: [requestedQuizNote(subjectOf(snapshot), count, settings)],
  }
}

// When to quiz: track edits, remind Claude, gate the quiz call, and send
// Claude back at Stop when a turn changed code but asked no quiz.

import type { EngineInterface, On } from 'claude-code'

import { QUIZ_TOOL, QUIZ_SOURCE } from '../config'
import type { ChangeTracker } from '../changes/changeTracker'
import { editedPath, isEditTool, linesChangedBy } from '../changes/edits'
import { isIgnoredFile } from '../changes/ignoredFiles'
import type { IgnoredFileCache } from '../changes/ignoredFiles'
import { asRecord } from '../lib/values'
import { isQuizEnabled, readSettings } from '../settings/settings'
import { askToStartQuiz } from './gate'
import type { OwnDialogs } from './ownDialogs'
import { changeGrewNote, firstEditNote, skippedReply, unquizzedStopNote, wrongLengthReply } from './prompts'
import { fitsQuestionCount, questionCountFor } from './questionCount'
import type { TurnReminders } from './turnReminders'

export type QuizFlowDeps = {
  changes: ChangeTracker
  reminders: TurnReminders
  ownDialogs: OwnDialogs
  ignoredFiles: IgnoredFileCache
}

const isQuizCall = (input: unknown) => {
  const rec = asRecord(input)
  return rec?.tool === QUIZ_TOOL && asRecord(rec.metadata)?.source === QUIZ_SOURCE
}

const questionsIn = (input: unknown) => {
  const questions = asRecord(input)?.questions
  return Array.isArray(questions) ? questions.length : 0
}

// A hidden user message; it reaches Claude at the loop's next step, even where
// a policy plugin above passes over this mod's Stop hook.
async function tellClaude($: EngineInterface, text: string) {
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } })
}

// Before a quiz runs: check its length, then ask the user whether they want it.
// Returns the refusal, or undefined to let the quiz go ahead.
async function gateQuiz($: EngineInterface, input: unknown, { changes }: QuizFlowDeps): Promise<string | undefined> {
  const asked = questionsIn(input)
  const count = questionCountFor(await readSettings($), changes.owed)
  // A quiz of the wrong length goes back to Claude before the user sees it.
  if (!fitsQuestionCount(count, asked)) return wrongLengthReply(count, asked)
  if (await askToStartQuiz($, [...changes.owed.keys()], asked)) return undefined
  changes.forget()
  return skippedReply
}

// After a successful edit: record it, and leave Claude the note it calls for.
async function recordEdit($: EngineInterface, input: unknown, { changes, reminders, ignoredFiles }: QuizFlowDeps) {
  const path = editedPath(input)
  // Lock files and git-ignored files are never quizzed on.
  if (path === undefined || (await isIgnoredFile($, path, ignoredFiles))) return
  changes.record(path, linesChangedBy(input))
  if (!(await isQuizEnabled($))) return

  const count = questionCountFor(await readSettings($), changes.current)
  const note = reminders.noteFor(count)
  if (note === 'first-edit') await tellClaude($, firstEditNote(count))
  if (note === 'change-grew' && count.mode === 'size') await tellClaude($, changeGrewNote(count))
}

export function registerQuizFlow(on: On, deps: QuizFlowDeps) {
  const { changes, reminders, ownDialogs } = deps
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) reminders.startTurn()
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const isMainLoop = e.agentId === undefined
    if (isMainLoop && isQuizCall(e) && (await isQuizEnabled($))) {
      const refusal = await gateQuiz($, e, deps)
      if (refusal !== undefined) return { deny: refusal }
    }

    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran

    if (isMainLoop && e.tool === QUIZ_TOOL && !ownDialogs.isOpen()) {
      // The quiz happened: nothing is owed until the next edit.
      changes.forget()
    } else if (isEditTool(e.tool)) {
      await recordEdit($, e, deps)
    }
    return ran
  })

  on('classic.Stop', async ($, e, next) => {
    const result = await next(e)
    // Someone else is already sending Claude back, or this is the stop after
    // our own push: let it end.
    if (result.block !== undefined || e.stop_hook_active) return result
    if (!changes.hasPending()) return result
    const owed = changes.takePending()
    if (!(await isQuizEnabled($))) return result
    changes.handToStop(owed)
    const count = questionCountFor(await readSettings($), owed)
    return { ...result, block: unquizzedStopNote([...owed.keys()], count) }
  })
}

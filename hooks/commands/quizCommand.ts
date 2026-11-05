// The `/quiz` command: one function per subcommand, picked by `runSubcommand`.
// A scope (`last`, `uncommitted`, `codebase`; see scopes/scopes.ts) starts a
// quiz on it. Plain `/quiz` opens a menu of them all (commandMenu.ts); closed,
// or where no dialog can show, it gives the status, as anything unknown does.
//
// The mod loader follows `$` only into function declarations, so subcommands
// are declared functions dispatched by a switch, not a table of closures.

import type { CommandRunResult, EngineInterface, On } from 'claude-code'

import { COMMAND_NAME, PLUGIN_NAME } from '../config'
import type { ChangeTracker } from '../changes/changeTracker'
import { readStats, statsLine } from '../scorecard/stats'
import { SETTINGS_USAGE, isQuizEnabled, readSettings, saveSettingFromWords, setQuizEnabled } from '../settings/settings'
import type { OwnDialogs } from '../quiz/ownDialogs'
import type { QuizRequest } from '../quiz/quizRequest'
import { requestQuiz } from '../scopes/requestQuiz'
import { SCOPES_USAGE, parseScope } from '../scopes/scopes'
import { openSettingsMenu } from '../settings/settingsMenu'
import { runSelfUpdate, versionReport } from '../update/selfUpdate'
import { openCommandMenu } from './commandMenu'
import { SUBCOMMAND_NAMES } from './subcommands'

export type QuizCommandDeps = { changes: ChangeTracker; ownDialogs: OwnDialogs; request: QuizRequest }

// Shown in the status reply.
const STATUS_HINTS = ['on|off', 'stats', 'settings', 'version', 'update'] as const

export async function defineQuizCommand($: EngineInterface) {
  await $.command.register({
    name: COMMAND_NAME,
    // The subcommands, each with what it does, are the autocomplete's rows.
    description: 'Comprehension quiz: ask for one now, change settings, see stats',
    argumentHint: SUBCOMMAND_NAMES.join('|'),
  })
}

async function switchQuiz($: EngineInterface, isOn: boolean, changes: ChangeTracker) {
  await setQuizEnabled($, isOn)
  if (!isOn) changes.forget()
  return `Comprehension quiz ${isOn ? 'enabled' : 'disabled'}.`
}

async function changeSettings($: EngineInterface, [name = '', value = '']: string[], ownDialogs: OwnDialogs) {
  if (name === '') return openSettingsMenu($, ownDialogs)
  const saved = await saveSettingFromWords($, name, value)
  return saved ?? `Unknown setting: ${`${name} ${value}`.trim()}. ${SETTINGS_USAGE}`
}

// Kept from before settings existed: `/quiz sound on|off`.
async function changeSound($: EngineInterface, [value = '']: string[]) {
  const saved = await saveSettingFromWords($, 'sound', value)
  if (saved !== undefined) return saved
  const { sound } = await readSettings($)
  return `Quiz sounds are ${sound ? 'on' : 'off'}. Use /${COMMAND_NAME} settings sound on|off.`
}

async function showStats($: EngineInterface) {
  return `📈 ${statsLine(await readStats($))}`
}

async function updateSelf($: EngineInterface) {
  $.ui.toast(`Updating ${PLUGIN_NAME}…`)
  return runSelfUpdate($)
}

async function showStatus($: EngineInterface) {
  const usage = STATUS_HINTS.map(hint => `/${COMMAND_NAME} ${hint}`).join(', ')
  return `Comprehension quiz is ${(await isQuizEnabled($)) ? 'on' : 'off'}. Use ${usage}. Quiz on demand: ${SCOPES_USAGE}.`
}

// `/quiz` on its own: the menu, then whatever was picked in it.
async function runFromMenu($: EngineInterface, deps: QuizCommandDeps): Promise<CommandRunResult> {
  const picked = await openCommandMenu($, deps.ownDialogs, await isQuizEnabled($))
  if (picked === undefined || picked.trim() === '') return { text: await showStatus($) }
  return runCommand($, picked, deps)
}

// `/quiz last 3` and the like: a quiz on that scope, or why there is none.
async function runCommand($: EngineInterface, args: string, deps: QuizCommandDeps): Promise<CommandRunResult> {
  const [name = '', ...words] = args.trim().toLowerCase().split(/\s+/)
  const parsed = parseScope(name, words)
  if (parsed === undefined) return { text: await runSubcommand($, name, words, deps) }
  if ('error' in parsed) return { text: `${parsed.error} Use ${SCOPES_USAGE}.` }
  return requestQuiz($, parsed.scope, deps.request)
}

async function runSubcommand($: EngineInterface, name: string, words: string[], deps: QuizCommandDeps) {
  switch (name) {
    case 'on':
      return switchQuiz($, true, deps.changes)
    case 'off':
      return switchQuiz($, false, deps.changes)
    case 'settings':
      return changeSettings($, words, deps.ownDialogs)
    case 'sound':
      return changeSound($, words)
    case 'stats':
      return showStats($)
    case 'version':
      return versionReport($)
    case 'update':
      return updateSelf($)
    default:
      return showStatus($)
  }
}

export function registerQuizCommand(on: On, deps: QuizCommandDeps) {
  on('command.run', { command: COMMAND_NAME }, async ($, e) =>
    e.args.trim() === '' ? runFromMenu($, deps) : runCommand($, e.args, deps),
  )
}

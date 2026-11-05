// The `/quiz` command: one function per subcommand, picked by `runSubcommand`.
// Anything else (or nothing) shows the status.
//
// The mod loader follows `$` only into function declarations, so subcommands
// are declared functions dispatched by a switch, not a table of closures.

import type { EngineInterface, On } from 'claude-code'

import { COMMAND_NAME, PLUGIN_NAME } from '../config'
import type { ChangeTracker } from '../changes/changeTracker'
import type { OwnDialogs } from '../quiz/ownDialogs'
import { readStats, statsLine } from '../scorecard/stats'
import { SETTINGS_USAGE, isQuizEnabled, readSettings, saveSettingFromWords, setQuizEnabled } from '../settings/settings'
import { openSettingsMenu } from '../settings/settingsMenu'
import { runSelfUpdate, versionReport } from '../update/selfUpdate'

export type QuizCommandDeps = { changes: ChangeTracker; ownDialogs: OwnDialogs }

// Shown in the command picker and in the status reply.
const SUBCOMMANDS = ['on', 'off', 'status', 'stats', 'settings', 'version', 'update'] as const
const STATUS_HINTS = ['on|off', 'stats', 'settings', 'version', 'update'] as const

export async function defineQuizCommand($: EngineInterface) {
  await $.command.register({
    name: COMMAND_NAME,
    description: `Comprehension quiz after code changes: ${SUBCOMMANDS.join(' | ')}`,
    argumentHint: SUBCOMMANDS.join('|'),
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
  return `Comprehension quiz is ${(await isQuizEnabled($)) ? 'on' : 'off'}. Use ${usage}.`
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
  on('command.run', { command: COMMAND_NAME }, async ($, e) => {
    const [name = '', ...words] = e.args.trim().toLowerCase().split(/\s+/)
    return { text: await runSubcommand($, name, words, deps) }
  })
}

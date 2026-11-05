// The `/quiz` autocomplete: rows for the word being typed, read from the
// same tables the command runs on (subcommands, scopes, settings), so a new
// subcommand, scope or setting shows up here with nothing else to change.
//
//   /quiz                         every subcommand, with what it does
//   /quiz unc                     uncommitted
//   /quiz settings per            perspective, with its current value
//   /quiz settings perspective a  architecture, with what it asks about
//
// `quizCompletions` is pure; `registerQuizCompletions` reads the settings
// only for rows that show a current value.

import type { EngineInterface, On, PromptAutocompleteInput, PromptAutocompleteSuggestion } from 'claude-code'

import { COMMAND_NAME } from '../config'
import { SETTING_DEFINITIONS, findSetting } from '../settings/definitions'
import type { SettingDefinition } from '../settings/definitions'
import { readSettings } from '../settings/settings'
import type { Settings } from '../settings/settings'
import { SUBCOMMAND_HELP } from './subcommands'
import type { SubcommandHelp } from './subcommands'

type TypedToken = Pick<PromptAutocompleteInput, 'text' | 'token' | 'start'>

const COMMAND = `/${COMMAND_NAME}`

// A word worth offering for `token`: it starts with it and is not already
// typed in full (taking that row would change nothing, and Enter should run
// the command rather than pick the row again).
const offers = (word: string, token: string) => {
  const typed = token.toLowerCase()
  return word.startsWith(typed) && word !== typed
}

// The words before the token, after `/quiz`: `/quiz settings per` gives
// ['settings']. Undefined when the box does not hold a `/quiz` command.
export const argsBefore = (text: string, start: number): string[] | undefined => {
  const [command, ...args] = text.slice(0, start).trim().split(/\s+/)
  return command === COMMAND ? args.map(arg => arg.toLowerCase()) : undefined
}

const usageOf = (sub: SubcommandHelp) => (sub.args === '' ? sub.name : `${sub.name} ${sub.args}`)

const subcommandRow = (sub: SubcommandHelp): PromptAutocompleteSuggestion => ({
  text: sub.name,
  label: usageOf(sub),
  description: sub.summary,
})

const settingRow = (def: SettingDefinition, settings: Settings | undefined): PromptAutocompleteSuggestion => ({
  text: def.names[0] as string,
  label: `${def.names[0]} ${def.usage}`,
  description: settings === undefined ? def.title : `${def.title}: now ${def.label(settings[def.key])}`,
})

const valueRow = (def: SettingDefinition, word: string, settings: Settings | undefined): PromptAutocompleteSuggestion => {
  const value = def.parse(word)
  const current = settings !== undefined && value === settings[def.key] ? ' (current)' : ''
  return { text: word, ...(value === undefined ? {} : { description: `${def.hint(value)}${current}` }) }
}

// The rows for the token at the cursor. `settings` fills in current values
// where a row shows one; without it those rows still come, without them.
export const quizCompletions = (typed: TypedToken, settings?: Settings): PromptAutocompleteSuggestion[] => {
  const { text, token, start } = typed
  // `/quiz` on its own: every subcommand, written out after the command.
  if (start === 0 && token === COMMAND) {
    return SUBCOMMAND_HELP.map(sub => ({ ...subcommandRow(sub), text: `${COMMAND} ${sub.name}`, label: `${COMMAND} ${usageOf(sub)}` }))
  }
  const args = argsBefore(text, start)
  if (args === undefined) return []
  const [subcommand, settingName] = args
  if (args.length === 0) return SUBCOMMAND_HELP.filter(sub => offers(sub.name, token)).map(subcommandRow)
  if (subcommand !== 'settings') return []
  if (args.length === 1) {
    return SETTING_DEFINITIONS.filter(def => offers(def.names[0] as string, token)).map(def => settingRow(def, settings))
  }
  const def = args.length === 2 && settingName !== undefined ? findSetting(settingName) : undefined
  return def === undefined ? [] : def.values.filter(word => offers(word, token)).map(word => valueRow(def, word, settings))
}

// Rows that show a current value: the settings and their values.
const showsSettings = (typed: TypedToken) => argsBefore(typed.text, typed.start)?.[0] === 'settings'

async function completionsFor($: Pick<EngineInterface, 'store'>, typed: TypedToken) {
  if (typed.token !== COMMAND && argsBefore(typed.text, typed.start) === undefined) return []
  return quizCompletions(typed, showsSettings(typed) ? await readSettings($) : undefined)
}

export function registerQuizCompletions(on: On) {
  on('prompt.autocomplete', async ($, e, next) => {
    const engine = await next(e)
    const mine = await completionsFor($, e)
    return mine.length === 0 ? engine : { suggestions: [...engine.suggestions, ...mine] }
  })
}

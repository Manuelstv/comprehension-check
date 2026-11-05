// The settings menu, as /config works: one list of every setting with its
// value; ↑↓ moves, Enter changes the one picked in place, and the list comes
// back with the new value until Esc. Sound and Length switch on Enter;
// Max questions asks for a number; a setting with `choices` (Perspective)
// lists them to pick from. Each dialog is a plain `$.ui.ask`.

import type { EngineInterface } from 'claude-code'

import { QUESTION_LIMITS, SETTINGS_MENU } from '../config'
import type { OwnDialogs } from '../quiz/ownDialogs'
import { SETTING_DEFINITIONS, findSetting } from './definitions'
import type { SettingDefinition, SettingValue, Settings } from './definitions'
import { SETTINGS_USAGE, readSettings, saveValue, summaryOf } from './settings'

type MenuHost = Pick<EngineInterface, 'store' | 'ui'>

// The label picked or the text typed, or undefined when the dialog was dismissed.
async function askOrDismiss($: MenuHost, question: string, header: string, options: string[]) {
  try {
    return (await $.ui.ask(question, { header, options })).trim()
  } catch {
    return undefined
  }
}

const rowLabel = (def: SettingDefinition, settings: Settings) => `${def.title}: ${def.label(settings[def.key])}`

// The menu's question: what Enter does, how to close it, and what the
// current length means.
const menuQuestion = (settings: Settings) =>
  `Enter changes the setting you pick; Esc when done. Length now: ${findSetting('sizing')?.hint(settings.sizing) ?? ''}`

// Max questions: a few numbers to pick, any from 1 to 99 typed under Other.
async function askMax($: MenuHost, def: SettingDefinition, current: number) {
  const options = SETTINGS_MENU.maxPresets.map(n => (n === current ? `${n}${SETTINGS_MENU.currentMark}` : String(n)))
  const question = `At most how many questions may a quiz have? Now ${current}. Pick one, or type ${QUESTION_LIMITS.min}-${QUESTION_LIMITS.max} under Other.`
  const answer = await askOrDismiss($, question, 'Max', options)
  return answer === undefined ? undefined : def.parse(answer.replace(SETTINGS_MENU.currentMark, ''))
}

// A setting with a list of values: each one with what it does, the current
// one marked.
async function askChoice($: MenuHost, def: SettingDefinition, current: SettingValue) {
  const choices = def.choices ?? []
  const labelOf = (value: SettingValue) =>
    `${def.label(value)}${value === current ? SETTINGS_MENU.currentMark : ''}`
  const question = `${def.title}: now ${def.label(current)}. ${choices.map(v => `${def.label(v)}: ${def.hint(v)}`).join(' ')}`
  const answer = await askOrDismiss($, question, def.title.slice(0, 12), choices.map(labelOf))
  if (answer === undefined) return undefined
  const picked = choices.find(value => labelOf(value) === answer)
  return picked ?? def.parse(answer.replace(SETTINGS_MENU.currentMark, '').toLowerCase())
}

export async function openSettingsMenu($: MenuHost, ownDialogs: OwnDialogs): Promise<string> {
  let changed = 0
  await ownDialogs.during(async () => {
    for (let round = 0; round < SETTINGS_MENU.maxRounds; round += 1) {
      const settings = await readSettings($)
      const rows = SETTING_DEFINITIONS.map(def => ({ def, label: rowLabel(def, settings) }))
      const picked = await askOrDismiss(
        $,
        menuQuestion(settings),
        SETTINGS_MENU.header,
        rows.map(row => row.label),
      )
      // Esc, or anything typed under Other that is not a setting, closes it.
      const def = rows.find(row => row.label === picked)?.def
      if (def === undefined) return

      const current = settings[def.key]
      const next =
        def.key === 'maxQuestions'
          ? await askMax($, def, current as number)
          : def.choices !== undefined
            ? await askChoice($, def, current)
            : def.step(current, 1)
      if (next !== undefined && next !== current) {
        await saveValue($, def, next)
        changed += 1
      }
    }
  })
  const summary = summaryOf(await readSettings($))
  return changed === 0 ? `No changes. ${summary} ${SETTINGS_USAGE}` : `Saved. ${summary}`
}

// The settings menu, as /config works: one list of every setting with its
// value; ↑↓ moves, Enter changes the one picked in place, and the list comes
// back with the new value until Done or Esc. Sound and Length switch on Enter;
// Max questions asks for a number. Each dialog is a plain `$.ui.ask`.

import type { EngineInterface } from 'claude-code'

import { QUESTION_LIMITS, SETTINGS_MENU } from '../config'
import type { OwnDialogs } from '../quiz/ownDialogs'
import { SETTING_DEFINITIONS, findSetting } from './definitions'
import type { SettingDefinition, Settings } from './definitions'
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

// The menu's question: what Enter does, and what the current length means.
const menuQuestion = (settings: Settings) =>
  `Enter changes the setting you pick. Length now: ${findSetting('sizing')?.hint(settings.sizing) ?? ''}`

// Max questions: a few numbers to pick, any from 1 to 99 typed under Other.
async function askMax($: MenuHost, def: SettingDefinition, current: number) {
  const options = SETTINGS_MENU.maxPresets.map(n => (n === current ? `${n}${SETTINGS_MENU.currentMark}` : String(n)))
  const question = `At most how many questions may a quiz have? Now ${current}. Pick one, or type ${QUESTION_LIMITS.min}-${QUESTION_LIMITS.max} under Other.`
  const answer = await askOrDismiss($, question, 'Max', options)
  return answer === undefined ? undefined : def.parse(answer.replace(SETTINGS_MENU.currentMark, ''))
}

export async function openSettingsMenu($: MenuHost, ownDialogs: OwnDialogs): Promise<string> {
  let changed = 0
  await ownDialogs.during(async () => {
    for (let round = 0; round < SETTINGS_MENU.maxRounds; round += 1) {
      const settings = await readSettings($)
      const rows = SETTING_DEFINITIONS.map(def => ({ def, label: rowLabel(def, settings) }))
      const picked = await askOrDismiss($, menuQuestion(settings), SETTINGS_MENU.header, [
        ...rows.map(row => row.label),
        SETTINGS_MENU.done,
      ])
      const def = rows.find(row => row.label === picked)?.def
      if (def === undefined) return

      const current = settings[def.key]
      const next = def.key === 'maxQuestions' ? await askMax($, def, current as number) : def.step(current, 1)
      if (next !== undefined && next !== current) {
        await saveValue($, def, next)
        changed += 1
      }
    }
  })
  const summary = summaryOf(await readSettings($))
  return changed === 0 ? `No changes. ${summary} ${SETTINGS_USAGE}` : `Saved. ${summary}`
}

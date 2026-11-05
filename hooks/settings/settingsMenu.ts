// The settings menu: pick a setting, pick its value, and back to the menu
// until Done or Esc. Each question is a plain `$.ui.ask` dialog.

import type { EngineInterface } from 'claude-code'

import { SETTINGS_MENU } from '../config'
import type { OwnDialogs } from '../quiz/ownDialogs'
import { SETTING_DEFINITIONS, SETTINGS_USAGE, choiceLabel, saveChoice, summarizeSettings } from './settings'

type MenuHost = Pick<EngineInterface, 'store' | 'ui'>

// The label picked, or undefined when the dialog was dismissed.
async function askOrDismiss($: MenuHost, question: string, header: string, options: string[]) {
  try {
    return await $.ui.ask(question, { header, options })
  } catch {
    return undefined
  }
}

export async function openSettingsMenu($: MenuHost, ownDialogs: OwnDialogs): Promise<string> {
  let saved = 0
  await ownDialogs.during(async () => {
    for (let round = 0; round < SETTINGS_MENU.maxRounds; round += 1) {
      const items = await Promise.all(
        SETTING_DEFINITIONS.map(async def => ({ def, label: `${def.menuName}: ${await choiceLabel($, def)}` })),
      )
      const picked = await askOrDismiss($, 'Which quiz setting do you want to change?', SETTINGS_MENU.header, [
        ...items.map(item => item.label),
        SETTINGS_MENU.done,
      ])
      const def = items.find(item => item.label === picked)?.def
      if (def === undefined) return

      const label = await askOrDismiss(
        $,
        def.question,
        def.header,
        def.choices.map(c => c.label),
      )
      const choice = def.choices.find(c => c.label === label?.trim())
      if (choice !== undefined) {
        await saveChoice($, def, choice)
        saved += 1
      }
    }
  })
  const summary = await summarizeSettings($)
  return saved === 0 ? `No changes. ${summary} ${SETTINGS_USAGE}` : `Saved. ${summary}`
}

// Reading and saving the user's quiz settings in the mod's store. What each
// setting is lives in definitions.ts.

import type { EngineInterface } from 'claude-code'

import { COMMAND_NAME, STORE_KEYS } from '../config'
import { SETTING_DEFINITIONS, findSetting } from './definitions'
import type { SettingDefinition, SettingValue, Settings } from './definitions'

export type { Settings } from './definitions'

type SettingsStore = Pick<EngineInterface, 'store'>

// The stored value; one that is not valid (or none stored) is the default.
async function storedValue($: SettingsStore, def: SettingDefinition): Promise<SettingValue> {
  return def.fromStore(await $.store.get(def.storeKey)) ?? def.defaultValue
}

export async function readSettings($: SettingsStore): Promise<Settings> {
  const entries = await Promise.all(SETTING_DEFINITIONS.map(async def => [def.key, await storedValue($, def)] as const))
  return Object.fromEntries(entries) as Settings
}

// Saves one value and says so.
export async function saveValue($: SettingsStore, def: SettingDefinition, value: SettingValue): Promise<string> {
  await $.store.set(def.storeKey, value)
  return def.saved(value)
}

// One setting from words, as typed after `/quiz settings`. Undefined when the
// setting or the value is unknown.
export async function saveSettingFromWords($: SettingsStore, name: string, word: string): Promise<string | undefined> {
  const def = findSetting(name)
  const value = def?.parse(word.trim().toLowerCase())
  return def === undefined || value === undefined ? undefined : saveValue($, def, value)
}

export const summaryOf = (settings: Settings): string =>
  `Quiz settings: ${SETTING_DEFINITIONS.map(def => def.summary(settings[def.key])).join(' · ')}.`

export const SETTINGS_USAGE = `Change one with ${SETTING_DEFINITIONS.map(
  def => `/${COMMAND_NAME} settings ${def.names[0]} ${def.usage}`,
).join(', ')}.`

export async function isQuizEnabled($: SettingsStore): Promise<boolean> {
  return (await $.store.get(STORE_KEYS.enabled)) !== false
}

export async function setQuizEnabled($: SettingsStore, isOn: boolean): Promise<void> {
  await $.store.set(STORE_KEYS.enabled, isOn)
}

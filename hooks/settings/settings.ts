// The user's quiz settings: what each one is, how it is stored, read and
// changed. Every setting is one entry in SETTING_DEFINITIONS, which the
// command line, the settings menu and the summary all read; adding a setting
// means adding an entry, nothing else.

import type { EngineInterface } from 'claude-code'

import { COMMAND_NAME, DEFAULT_SETTINGS, QUESTION_LIMITS, STORE_KEYS } from '../config'
import type { Sizing } from '../config'

export type Settings = { sound: boolean; maxQuestions: number; sizing: Sizing }

type SettingValue = Settings[keyof Settings]

type Choice = {
  // What the command line takes: `/quiz settings sound on`.
  word: string
  // What the menu shows.
  label: string
  value: SettingValue
  // How the summary line reads it: "sound on".
  summary: string
  // What the user is told once it is saved.
  saved: string
}

export type SettingDefinition = {
  key: keyof Settings
  storeKey: string
  // Names the command line accepts: `/quiz settings questions 3`, `... max 3`.
  names: readonly string[]
  // The setting's name in the menu, and the question that picks its value.
  menuName: string
  header: string
  question: string
  choices: readonly Choice[]
  defaultValue: SettingValue
}

const questionChoices: Choice[] = []
for (let n = QUESTION_LIMITS.min; n <= QUESTION_LIMITS.max; n += 1) {
  questionChoices.push({
    word: String(n),
    label: String(n),
    value: n,
    summary: `at most ${n} questions`,
    saved: `Quizzes now have at most ${n} questions.`,
  })
}

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  {
    key: 'sound',
    storeKey: STORE_KEYS.sound,
    names: ['sound'],
    menuName: 'Sound',
    header: 'Sound',
    question: 'Play a sound with the quiz scorecard?',
    defaultValue: DEFAULT_SETTINGS.sound,
    choices: [
      { word: 'on', label: 'On', value: true, summary: 'sound on', saved: 'Quiz sounds on.' },
      { word: 'off', label: 'Off', value: false, summary: 'sound off', saved: 'Quiz sounds off.' },
    ],
  },
  {
    key: 'maxQuestions',
    storeKey: STORE_KEYS.maxQuestions,
    names: ['questions', 'max'],
    menuName: 'Max questions',
    header: 'Questions',
    question: 'At most how many questions should a quiz have?',
    defaultValue: DEFAULT_SETTINGS.maxQuestions,
    choices: questionChoices,
  },
  {
    key: 'sizing',
    storeKey: STORE_KEYS.sizing,
    names: ['count'],
    menuName: 'Count',
    header: 'Count',
    question:
      'Who decides how many questions a quiz has? By change size counts files touched and lines changed, without lock or git-ignored files.',
    defaultValue: DEFAULT_SETTINGS.sizing,
    choices: [
      {
        word: 'agent',
        label: 'Claude decides',
        value: 'agent',
        summary: 'count Claude decides',
        saved: 'Claude now decides the question count, up to your max.',
      },
      {
        word: 'size',
        label: 'By change size',
        value: 'size',
        summary: 'count by change size',
        saved: 'The question count now follows the size of the change (lock and git-ignored files do not count).',
      },
    ],
  },
]

type SettingsStore = Pick<EngineInterface, 'store'>

// The stored choice; a value no choice has (or none stored) is the default.
async function currentChoice($: SettingsStore, def: SettingDefinition): Promise<Choice> {
  const stored = await $.store.get(def.storeKey)
  const found = def.choices.find(c => c.value === stored) ?? def.choices.find(c => c.value === def.defaultValue)
  return found ?? (def.choices[0] as Choice)
}

export async function readSettings($: SettingsStore): Promise<Settings> {
  const entries = await Promise.all(
    SETTING_DEFINITIONS.map(async def => [def.key, (await currentChoice($, def)).value] as const),
  )
  return Object.fromEntries(entries) as Settings
}

export async function choiceLabel($: SettingsStore, def: SettingDefinition): Promise<string> {
  return (await currentChoice($, def)).label
}

export const findSetting = (name: string) => SETTING_DEFINITIONS.find(def => def.names.includes(name))

// Saves one choice and says so.
export async function saveChoice($: SettingsStore, def: SettingDefinition, choice: Choice): Promise<string> {
  await $.store.set(def.storeKey, choice.value)
  return choice.saved
}

// One setting from words, as typed after `/quiz settings`. Undefined when the
// setting or the value is unknown.
export async function saveSettingFromWords($: SettingsStore, name: string, word: string): Promise<string | undefined> {
  const def = findSetting(name)
  const choice = def?.choices.find(c => c.word === word)
  return def === undefined || choice === undefined ? undefined : saveChoice($, def, choice)
}

export async function summarizeSettings($: SettingsStore): Promise<string> {
  const parts = await Promise.all(SETTING_DEFINITIONS.map(async def => (await currentChoice($, def)).summary))
  return `Quiz settings: ${parts.join(' · ')}.`
}

export const SETTINGS_USAGE = `Change one with ${SETTING_DEFINITIONS.map(
  def => `/${COMMAND_NAME} settings ${def.names[0]} ${def.choices.map(c => c.word).join('|')}`,
).join(', ')}.`

export async function isQuizEnabled($: SettingsStore): Promise<boolean> {
  return (await $.store.get(STORE_KEYS.enabled)) !== false
}

export async function setQuizEnabled($: SettingsStore, isOn: boolean): Promise<void> {
  await $.store.set(STORE_KEYS.enabled, isOn)
}

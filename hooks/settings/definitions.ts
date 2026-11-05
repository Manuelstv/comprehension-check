// What each quiz setting is: its names, values, how Enter steps it, and the
// words that describe it. The command line, the settings menu and the summary
// all read this table; adding a setting means adding an entry.

import { DEFAULT_SETTINGS, LINES_PER_QUESTION, PERSPECTIVES, QUESTION_LIMITS, STORE_KEYS, WORDINGS } from '../config'
import type { Perspective, Sizing, Wording } from '../config'

export type Settings = {
  sound: boolean
  maxQuestions: number
  sizing: Sizing
  perspective: Perspective
  wording: Wording
}

export type SettingValue = Settings[keyof Settings]

// Methods, not function properties, so a definition of one value type fits
// the table of them all.
export type SettingDefinition<V = SettingValue> = {
  key: keyof Settings
  storeKey: string
  // Names the command line accepts, the first one shown: `/quiz settings max 3`.
  names: readonly string[]
  // The values the command line takes, as the usage line shows them.
  usage: string
  // The setting's name in the settings menu.
  title: string
  defaultValue: V
  // Every value, when the menu offers them as a list to pick from. Without
  // it, Enter steps the value on.
  choices?: readonly V[]
  // The value as the menu shows it: "On", "4", "Claude decides".
  label(value: V): string
  // One line under the row that says what the value does.
  hint(value: V): string
  // The next (+1) or previous (-1) value; Enter in the menu moves it on.
  step(value: V, direction: -1 | 1): V
  // A value from a command-line word or typed text (lower case).
  parse(word: string): V | undefined
  // The stored value, or undefined when it is not a valid one.
  fromStore(stored: unknown): V | undefined
  // How the summary line reads it: "sound on".
  summary(value: V): string
  // What the user is told once it is saved.
  saved(value: V): string
}

const isQuestionCount = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= QUESTION_LIMITS.min && n <= QUESTION_LIMITS.max

const clampCount = (n: number) => Math.min(QUESTION_LIMITS.max, Math.max(QUESTION_LIMITS.min, n))

const questions = (n: number) => `${n} question${n === 1 ? '' : 's'}`

const sound: SettingDefinition<boolean> = {
  key: 'sound',
  storeKey: STORE_KEYS.sound,
  names: ['sound'],
  usage: 'on|off',
  title: 'Sound',
  defaultValue: DEFAULT_SETTINGS.sound,
  label: value => (value ? 'On' : 'Off'),
  hint: value => (value ? 'A short sound plays with each scorecard.' : 'The scorecard stays silent.'),
  step: value => !value,
  parse: word => (word === 'on' ? true : word === 'off' ? false : undefined),
  fromStore: stored => (typeof stored === 'boolean' ? stored : undefined),
  summary: value => `sound ${value ? 'on' : 'off'}`,
  saved: value => `Quiz sounds ${value ? 'on' : 'off'}.`,
}

const maxQuestions: SettingDefinition<number> = {
  key: 'maxQuestions',
  storeKey: STORE_KEYS.maxQuestions,
  names: ['max', 'questions'],
  usage: `${QUESTION_LIMITS.min}-${QUESTION_LIMITS.max}`,
  title: 'Max questions',
  defaultValue: DEFAULT_SETTINGS.maxQuestions,
  label: value => String(value),
  hint: value =>
    value > QUESTION_LIMITS.perDialog
      ? `No quiz has more. Past ${QUESTION_LIMITS.perDialog}, it comes in rounds of ${QUESTION_LIMITS.perDialog}.`
      : 'No quiz has more than this.',
  step: (value, direction) => clampCount(value + direction),
  parse: word => {
    const n = /^\d+$/.test(word) ? Number(word) : NaN
    return isQuestionCount(n) ? n : undefined
  },
  fromStore: stored => (isQuestionCount(stored) ? stored : undefined),
  summary: value => `at most ${questions(value)}`,
  saved: value => `Quizzes now have at most ${questions(value)}.`,
}

const SIZING_HINTS: Record<Sizing, string> = {
  agent: 'Claude weighs how severe and complex the change is.',
  size: `${questions(1)} per ${LINES_PER_QUESTION} changed lines.`,
}

const sizing: SettingDefinition<Sizing> = {
  key: 'sizing',
  storeKey: STORE_KEYS.sizing,
  // `count` is the name it had before.
  names: ['length', 'count'],
  usage: 'claude|size',
  title: 'Length',
  defaultValue: DEFAULT_SETTINGS.sizing,
  label: value => (value === 'agent' ? 'Claude decides' : 'Fits change size'),
  hint: value => `${SIZING_HINTS[value]} Never more than the max.`,
  step: value => (value === 'agent' ? 'size' : 'agent'),
  parse: word => (['claude', 'agent'].includes(word) ? 'agent' : word === 'size' ? 'size' : undefined),
  fromStore: stored => (stored === 'agent' || stored === 'size' ? stored : undefined),
  summary: value => (value === 'agent' ? 'Claude decides the length' : 'length fits the change size'),
  saved: value => `Quiz length: ${value === 'agent' ? 'Claude decides' : 'fits the change size'}. ${SIZING_HINTS[value]}`,
}

const PERSPECTIVE_TEXT: Record<Perspective, { label: string; words: readonly string[]; hint: string }> = {
  mixed: {
    label: 'Mixed',
    words: ['mixed', 'mix', 'all'],
    hint: 'Code, architecture and product angles, as the change calls for.',
  },
  code: {
    label: 'Code',
    words: ['code', 'coding', 'dev', 'developer'],
    hint: 'How it behaves: edge cases, failure paths, what the tests miss.',
  },
  architecture: {
    label: 'Architecture',
    words: ['architecture', 'architect', 'arch', 'design'],
    hint: 'How it fits: design trade-offs, coupling, blast radius, failure modes.',
  },
  product: {
    label: 'Product',
    words: ['product', 'pm', 'user', 'users'],
    hint: 'What it means for users: behavior, defaults, scope, how to know it works.',
  },
}

const perspective: SettingDefinition<Perspective> = {
  key: 'perspective',
  storeKey: STORE_KEYS.perspective,
  names: ['perspective', 'lens', 'view'],
  usage: 'mixed|code|architect|product',
  title: 'Perspective',
  defaultValue: DEFAULT_SETTINGS.perspective,
  choices: PERSPECTIVES,
  label: value => PERSPECTIVE_TEXT[value].label,
  hint: value => PERSPECTIVE_TEXT[value].hint,
  step: (value, direction) => {
    const at = PERSPECTIVES.indexOf(value)
    return PERSPECTIVES[(at + direction + PERSPECTIVES.length) % PERSPECTIVES.length] as Perspective
  },
  parse: word => PERSPECTIVES.find(p => PERSPECTIVE_TEXT[p].words.includes(word)),
  fromStore: stored => PERSPECTIVES.find(p => p === stored),
  summary: value => `${PERSPECTIVE_TEXT[value].label.toLowerCase()} perspective`,
  saved: value => `Quiz perspective: ${PERSPECTIVE_TEXT[value].label}. ${PERSPECTIVE_TEXT[value].hint}`,
}

const WORDING_TEXT: Record<Wording, { label: string; words: readonly string[]; hint: string }> = {
  plain: {
    label: 'Plain',
    words: ['plain', 'simple', 'easy', 'clear'],
    hint: 'Short sentences and everyday words: your time goes into the answer, not the reading.',
  },
  standard: {
    label: 'Standard',
    words: ['standard', 'technical', 'precise', 'dense'],
    hint: 'Precise technical wording, as dense as the change calls for.',
  },
}

const wording: SettingDefinition<Wording> = {
  key: 'wording',
  storeKey: STORE_KEYS.wording,
  names: ['wording', 'words', 'language'],
  usage: 'plain|standard',
  title: 'Wording',
  defaultValue: DEFAULT_SETTINGS.wording,
  label: value => WORDING_TEXT[value].label,
  hint: value => WORDING_TEXT[value].hint,
  step: value => (value === 'plain' ? 'standard' : 'plain'),
  parse: word => WORDINGS.find(w => WORDING_TEXT[w].words.includes(word)),
  fromStore: stored => WORDINGS.find(w => w === stored),
  summary: value => `${WORDING_TEXT[value].label.toLowerCase()} wording`,
  saved: value => `Quiz wording: ${WORDING_TEXT[value].label}. ${WORDING_TEXT[value].hint}`,
}

const asAny = <V>(def: SettingDefinition<V>) => def as unknown as SettingDefinition

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  asAny(sound),
  asAny(maxQuestions),
  asAny(sizing),
  asAny(perspective),
  asAny(wording),
]

export const findSetting = (name: string) =>
  SETTING_DEFINITIONS.find(def => def.names.includes(name) || def.key === name)

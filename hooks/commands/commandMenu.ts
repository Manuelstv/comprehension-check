// The menu plain `/quiz` opens: every subcommand with what it does, to pick
// from. Its rows come from SUBCOMMAND_HELP, so the menu, the autocomplete and
// the command picker never disagree. A pick becomes the words that would
// follow `/quiz`, so it runs through the same dispatch as a typed command.

import type { EngineInterface } from 'claude-code'

import { COMMAND_MENU } from '../config'
import type { OwnDialogs } from '../quiz/ownDialogs'
import { pickFromList } from '../ui/pickList'
import type { Choice, PickList } from '../ui/pickList'
import { SUBCOMMAND_HELP } from './subcommands'

const PAGE_ROWS = { more: COMMAND_MENU.moreRow, back: COMMAND_MENU.backRow }

const list = <T>(question: string, choices: readonly Choice<T>[]): PickList<T> => ({
  question,
  header: COMMAND_MENU.header,
  choices,
  pageRows: PAGE_ROWS,
  maxRounds: COMMAND_MENU.maxRounds,
})

// The rows: every subcommand but `status` (the menu's question says it), and
// one switch for the automatic quizzes, whichever way it would turn them.
export const menuChoices = (enabled: boolean): Choice<string>[] =>
  SUBCOMMAND_HELP.filter(sub => sub.name !== 'status' && sub.name !== (enabled ? 'on' : 'off')).map(sub => ({
    label: sub.name,
    description: sub.summary,
    value: sub.name,
  }))

export const commitCountChoices = (): Choice<string>[] =>
  COMMAND_MENU.commitCounts.map(n => ({
    label: n === 1 ? 'The last commit' : `The last ${n} commits`,
    description: n === 1 ? 'Only the most recent commit' : `The ${n} most recent commits, together`,
    value: `last ${n}`,
  }))

export const menuQuestion = (enabled: boolean) =>
  `Quizzes after Claude's edits are ${enabled ? 'on' : 'off'}. Pick a command, or type one under Other (like "last 5").`

type MenuHost = Pick<EngineInterface, 'ui'>

// After "last": how many commits. A typed number runs as `last <n>`.
async function askCommitCount($: MenuHost, ownDialogs: OwnDialogs) {
  const picked = await pickFromList($, ownDialogs, list('How many commits should the quiz cover? Or type a number under Other.', commitCountChoices()))
  if (picked === undefined) return undefined
  return 'typed' in picked ? `last ${picked.typed}` : picked.value
}

// The words to run after `/quiz`, or undefined when the menu was closed.
export async function openCommandMenu($: MenuHost, ownDialogs: OwnDialogs, enabled: boolean): Promise<string | undefined> {
  const picked = await pickFromList($, ownDialogs, list(menuQuestion(enabled), menuChoices(enabled)))
  if (picked === undefined) return undefined
  if ('typed' in picked) return picked.typed
  return picked.value === 'last' ? askCommitCount($, ownDialogs) : picked.value
}

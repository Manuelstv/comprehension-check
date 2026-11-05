// A list to pick from, each row with a line on what it does: one `$.ui.ask`
// dialog, in pages when the list is longer than a dialog holds. Text typed
// under Other comes back as typed.
//
// The engine lets a plugin ask only through `$.ui.ask`, whose options are
// plain labels, so each row's explanation is part of its label:
// "uncommitted — Quiz on your staged, unstaged and new files".
//
// It runs inside `ownDialogs`, so the quiz flow does not take the dialog for
// a quiz having happened.

import type { EngineInterface } from 'claude-code'

import type { OwnDialogs } from '../quiz/ownDialogs'
import { menuPages, pageRow } from './menuPages'
import type { PageRows } from './menuPages'

export type Choice<T> = { label: string; description: string; value: T }

export type PickList<T> = {
  question: string
  // The chip beside the question, 12 characters at most.
  header: string
  choices: readonly Choice<T>[]
  // The rows that turn the page.
  pageRows: PageRows
  // Page turns before the list closes by itself.
  maxRounds: number
}

// What the person did: picked a row, typed under Other, or dismissed it.
export type Picked<T> = { value: T } | { typed: string } | undefined

type AskHost = Pick<EngineInterface, 'ui'>

// The label picked or the text typed, or undefined when the dialog was
// dismissed or cannot show (a headless run).
export async function askOrDismiss($: AskHost, question: string, header: string, options: string[]) {
  try {
    return (await $.ui.ask(question, { header, options })).trim()
  } catch {
    return undefined
  }
}

// A row as the dialog shows it: the label, then what it does.
export const rowText = (choice: Pick<Choice<unknown>, 'label' | 'description'>) =>
  `${choice.label} — ${choice.description}`

export async function pickFromList<T>($: AskHost, ownDialogs: OwnDialogs, list: PickList<T>): Promise<Picked<T>> {
  const pages = menuPages(list.choices)
  return ownDialogs.during(async () => {
    let page = 0
    for (let round = 0; round < list.maxRounds; round += 1) {
      const rows = pages[page] ?? []
      const turn = pageRow(page, pages.length, list.pageRows)
      const answer = await askOrDismiss($, list.question, list.header, [
        ...rows.map(rowText),
        ...(turn === undefined ? [] : [turn]),
      ])
      if (answer === undefined || answer === '') return undefined
      if (answer === turn) {
        page = (page + 1) % pages.length
        continue
      }
      const picked = rows.find(row => rowText(row) === answer)
      return picked === undefined ? { typed: answer } : { value: picked.value }
    }
    return undefined
  })
}

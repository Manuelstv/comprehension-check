// What `/quiz` takes, in the order the autocomplete lists it: each
// subcommand's name, what may follow it, and one line on what it does. The
// command picker, the autocomplete and the status reply read this table.

import { SCOPE_DEFINITIONS } from '../scopes/scopes'

export type SubcommandHelp = { name: string; args: string; summary: string }

const SCOPES: SubcommandHelp[] = SCOPE_DEFINITIONS.map(def => ({
  name: def.names[0] as string,
  args: def.usage.trim(),
  summary: def.summary,
}))

export const SUBCOMMAND_HELP: readonly SubcommandHelp[] = [
  ...SCOPES,
  { name: 'settings', args: '[setting value]', summary: 'Open the settings menu, or set one setting' },
  { name: 'stats', args: '', summary: 'Your record: quizzes, average, best score, streak' },
  { name: 'status', args: '', summary: 'Whether the automatic quizzes are on' },
  { name: 'on', args: '', summary: 'Turn the automatic quizzes after edits on' },
  { name: 'off', args: '', summary: 'Turn the automatic quizzes after edits off' },
  { name: 'version', args: '', summary: 'The installed version, and whether a newer one is out' },
  { name: 'update', args: '', summary: 'Update the mod to the latest version' },
]

export const SUBCOMMAND_NAMES: readonly string[] = SUBCOMMAND_HELP.map(sub => sub.name)

// What an on-demand quiz is about: `/quiz last [n]`, `/quiz uncommitted`,
// `/quiz codebase`. Pure: reading a scope from git is in collectScope.ts.
//
// Each scope is defined once in SCOPE_DEFINITIONS; the command line, the
// usage line and the descriptions read it. Adding a scope means adding an
// entry here and a case in collectScope.ts.

import { COMMAND_NAME, ON_DEMAND } from '../config'
import { plural } from '../lib/text'

export type QuizScope =
  // The last `count` commits on HEAD; 1 is the last commit.
  | { kind: 'commits'; count: number }
  // Staged, unstaged and untracked changes against HEAD.
  | { kind: 'uncommitted' }
  // Every file git does not ignore, as it is in the working tree.
  | { kind: 'codebase' }

export type ScopeKind = QuizScope['kind']

// A parsed scope, or why the words did not make one.
export type ParsedScope = { scope: QuizScope } | { error: string }

type ScopeDefinition = {
  kind: ScopeKind
  // Subcommand names, the first one shown: `/quiz last 3`.
  names: readonly string[]
  // What follows the name in the usage line.
  usage: string
  // One line on what it quizzes, for the command's autocomplete.
  summary: string
  // A scope from the words after its name.
  parse(args: readonly string[]): ParsedScope
}

const { maxCommits } = ON_DEMAND

const isCommitCount = (n: number) => Number.isInteger(n) && n >= 1 && n <= maxCommits

const commits: ScopeDefinition = {
  kind: 'commits',
  names: ['last', 'commits', 'commit'],
  usage: ` [1-${maxCommits}]`,
  summary: `Quiz on the last commit, or the last n (1-${maxCommits})`,
  parse: ([word]) => {
    if (word === undefined) return { scope: { kind: 'commits', count: 1 } }
    const count = /^\d+$/.test(word) ? Number(word) : NaN
    return isCommitCount(count)
      ? { scope: { kind: 'commits', count } }
      : { error: `"${word}" is not a number of commits from 1 to ${maxCommits}.` }
  },
}

const uncommitted: ScopeDefinition = {
  kind: 'uncommitted',
  names: ['uncommitted', 'changes', 'diff', 'wip'],
  usage: '',
  summary: 'Quiz on your staged, unstaged and new files',
  parse: () => ({ scope: { kind: 'uncommitted' } }),
}

const codebase: ScopeDefinition = {
  kind: 'codebase',
  names: ['codebase', 'all', 'repo', 'project'],
  usage: '',
  summary: 'Quiz on the whole codebase as it stands',
  parse: () => ({ scope: { kind: 'codebase' } }),
}

export const SCOPE_DEFINITIONS: readonly ScopeDefinition[] = [commits, uncommitted, codebase]

// The scope `/quiz <name> <args>` asks for; undefined when `name` is not a
// scope (another subcommand).
export const parseScope = (name: string, args: readonly string[]): ParsedScope | undefined =>
  SCOPE_DEFINITIONS.find(def => def.names.includes(name))?.parse(args)

// "the last commit", "the last 5 commits", "the uncommitted changes".
export const describeScope = (scope: QuizScope): string => {
  switch (scope.kind) {
    case 'commits':
      return scope.count === 1 ? 'the last commit' : `the last ${scope.count} ${plural(scope.count, 'commit')}`
    case 'uncommitted':
      return 'the uncommitted changes'
    case 'codebase':
      return 'the whole codebase'
  }
}

export const SCOPES_USAGE = SCOPE_DEFINITIONS.map(def => `/${COMMAND_NAME} ${def.names[0]}${def.usage}`).join(', ')

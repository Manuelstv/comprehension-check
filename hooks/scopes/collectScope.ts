// Reads an on-demand quiz's scope from git: which files it covers, the lines
// in each, and (for commits) which commits. Every git call goes through
// `runGit`; parsing is in gitOutput.ts, so this file only decides what to ask.
//
// Paths are relative to the repo's top level, where every command runs.
// Lock files never count; git-ignored files are never listed by these commands.

import type { EngineInterface } from 'claude-code'

import { ON_DEMAND } from '../config'
import { mergeChanges, withoutLockFiles } from '../changes/changeSets'
import type { Changes } from '../changes/changeTracker'
import { lastNonEmptyLine } from '../lib/text'
import { LOG_FORMAT, parseLog, parseNumstat, parseNumstatRow, parsePathList } from './gitOutput'
import type { Commit } from './gitOutput'
import { describeScope } from './scopes'
import type { QuizScope } from './scopes'

// What a scope holds right now.
export type ScopeSnapshot = {
  scope: QuizScope
  changes: Changes
  // The commits read, newest first: for a commits scope, empty otherwise.
  commits: readonly Commit[]
  // Files git does not track yet; they are in `changes` too.
  untracked: readonly string[]
}

export type Collected = { snapshot: ScopeSnapshot } | { error: string }

type GitHost = Pick<EngineInterface, 'process'>

type GitRun = { ok: true; stdout: string } | { ok: false; why: string }

// `git diff --no-index` exits 1 when the files differ, which is what it is
// asked for here.
const DIFF_FOUND = 1

// Runs `git <args>`; exit codes in `okCodes` count as success. Never throws.
async function runGit($: GitHost, args: readonly string[], cwd?: string, okCodes: readonly number[] = [0]) {
  try {
    const ran = await $.process.run(['git', '-c', 'core.quotePath=false', ...args], {
      ...(cwd === undefined ? {} : { cwd }),
      stdin: '',
      timeoutMs: ON_DEMAND.gitTimeoutMs,
    })
    if (okCodes.includes(ran.exitCode)) return { ok: true, stdout: ran.stdout } as GitRun
    return { ok: false, why: lastNonEmptyLine(ran.stderr) ?? `git ${args[0]} exited ${ran.exitCode}` } as GitRun
  } catch {
    return { ok: false, why: 'git could not run here' } as GitRun
  }
}

// The tree with no files: a base that makes every line of every file a change.
async function emptyTree($: GitHost, root: string) {
  const ran = await runGit($, ['hash-object', '-t', 'tree', '--stdin'], root)
  return ran.ok ? ran.stdout.trim() : undefined
}

// HEAD, or the empty tree in a repo with no commits yet.
async function baseRevision($: GitHost, root: string) {
  const head = await runGit($, ['rev-parse', '--verify', '--quiet', 'HEAD'], root)
  return head.ok ? 'HEAD' : emptyTree($, root)
}

// Untracked files that git does not ignore, each with its line count. Past
// ON_DEMAND.countedUntracked files, the rest are listed at 0 lines.
async function untrackedChanges($: GitHost, root: string) {
  const listed = await runGit($, ['ls-files', '--others', '--exclude-standard', '-z'], root)
  const paths = listed.ok ? parsePathList(listed.stdout) : []
  const changes = new Map<string, number>()
  for (const [i, path] of paths.entries()) {
    let lines = 0
    if (i < ON_DEMAND.countedUntracked) {
      const diff = await runGit($, ['diff', '--no-index', '--numstat', '--', '/dev/null', path], root, [0, DIFF_FOUND])
      lines = diff.ok ? (parseNumstatRow(diff.stdout.trim())?.lines ?? 0) : 0
    }
    changes.set(path, lines)
  }
  return { paths, changes }
}

async function commitsSnapshot($: GitHost, root: string, scope: Extract<QuizScope, { kind: 'commits' }>) {
  const log = await runGit($, ['log', '-n', String(scope.count), '--numstat', '--no-renames', `--format=${LOG_FORMAT}`], root)
  if (!log.ok) return { error: `Could not read ${describeScope(scope)}: ${log.why}` }
  const { commits, changes } = parseLog(log.stdout)
  return { snapshot: { scope, changes, commits, untracked: [] } }
}

// The working tree against `base`, tracked files and untracked ones together.
async function workingTreeSnapshot($: GitHost, root: string, scope: QuizScope, base: string | undefined) {
  if (base === undefined) return { error: `Could not read ${describeScope(scope)}: git found no base to compare with.` }
  const diff = await runGit($, ['diff', '--numstat', '--no-renames', base], root)
  if (!diff.ok) return { error: `Could not read ${describeScope(scope)}: ${diff.why}` }
  const untracked = await untrackedChanges($, root)
  const changes = mergeChanges(parseNumstat(diff.stdout), untracked.changes)
  return { snapshot: { scope, changes, commits: [], untracked: untracked.paths } }
}

async function snapshotOf($: GitHost, root: string, scope: QuizScope): Promise<Collected> {
  switch (scope.kind) {
    case 'commits':
      return commitsSnapshot($, root, scope)
    case 'uncommitted':
      return workingTreeSnapshot($, root, scope, await baseRevision($, root))
    case 'codebase':
      return workingTreeSnapshot($, root, scope, await emptyTree($, root))
  }
}

// The scope as it is now, without lock files; an error when git cannot read
// it or it holds no code to quiz on.
export async function collectScope($: GitHost, scope: QuizScope): Promise<Collected> {
  const top = await runGit($, ['rev-parse', '--show-toplevel'])
  if (!top.ok) return { error: `Not in a git repository: a quiz on ${describeScope(scope)} reads it from git.` }
  const collected = await snapshotOf($, top.stdout.trim(), scope)
  if ('error' in collected) return collected
  const changes = withoutLockFiles(collected.snapshot.changes)
  if (changes.size === 0) return { error: `Nothing to quiz on in ${describeScope(scope)}: no changed lines outside lock files.` }
  const untracked = collected.snapshot.untracked.filter(path => changes.has(path))
  return { snapshot: { ...collected.snapshot, changes, untracked } }
}

// Parsers for the git output an on-demand quiz reads. Pure: running git is
// in collectScope.ts, which passes the formats below.

import type { Changes } from '../changes/changeTracker'

export type Commit = { hash: string; subject: string }

// `git log --format`: a commit's header line, "@<TAB>hash<TAB>subject". A
// `--numstat` row starts with a number or "-", never "@".
export const LOG_FORMAT = '@%x09%h%x09%s'
const COMMIT_HEADER = /^@\t([^\t]+)\t(.*)$/

// One `--numstat` row, "added<TAB>deleted<TAB>path": the path and the lines
// changed (added plus deleted). A binary file ("-<TAB>-<TAB>path") or any
// other line gives undefined.
export const parseNumstatRow = (row: string): { path: string; lines: number } | undefined => {
  const match = /^(\d+)\t(\d+)\t(.+)$/.exec(row)
  if (match === null) return undefined
  const [, added, deleted, path] = match as unknown as [string, string, string, string]
  return { path, lines: Number(added) + Number(deleted) }
}

const addRow = (changes: Map<string, number>, row: string) => {
  const parsed = parseNumstatRow(row)
  if (parsed !== undefined) changes.set(parsed.path, (changes.get(parsed.path) ?? 0) + parsed.lines)
}

// `git diff --numstat`: lines changed per path. A path listed twice is summed.
export const parseNumstat = (stdout: string): Changes => {
  const changes = new Map<string, number>()
  for (const row of stdout.split('\n')) addRow(changes, row)
  return changes
}

// `git log --numstat --format=LOG_FORMAT`: the commits, newest first, and the
// lines each path changed across all of them.
export const parseLog = (stdout: string): { commits: Commit[]; changes: Changes } => {
  const commits: Commit[] = []
  const changes = new Map<string, number>()
  for (const row of stdout.split('\n')) {
    const header = COMMIT_HEADER.exec(row)
    if (header === null) addRow(changes, row)
    else commits.push({ hash: header[1] as string, subject: header[2] as string })
  }
  return { commits, changes }
}

// A `-z` path list (`git ls-files -z`): the paths, none empty.
export const parsePathList = (stdout: string): string[] => stdout.split('\0').filter(path => path !== '')

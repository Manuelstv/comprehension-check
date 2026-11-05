// Pure operations on a set of changes (path → lines changed), whichever way
// it was gathered: from a turn's edits or read from git.

import type { Changes } from './changeTracker'
import { isLockFile } from './ignoredFiles'

// One set from several, lines summed per path.
export const mergeChanges = (...sets: readonly Changes[]): Changes => {
  const merged = new Map<string, number>()
  for (const set of sets) {
    for (const [path, lines] of set) merged.set(path, (merged.get(path) ?? 0) + lines)
  }
  return merged
}

// Lock files never count as a change worth a quiz.
export const withoutLockFiles = (changes: Changes): Changes =>
  new Map([...changes].filter(([path]) => !isLockFile(path)))

// Paths with the most changed lines first; ties keep path order.
export const largestFirst = (changes: Changes): [string, number][] =>
  [...changes].sort(([pathA, a], [pathB, b]) => b - a || pathA.localeCompare(pathB))

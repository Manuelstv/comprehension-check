// Files that never count as a change worth a quiz: dependency lock files
// (by name) and files the repo's .gitignore covers (asked of git).

import type { EngineInterface } from 'claude-code'

import { IGNORED_FILES } from '../config'
import { baseName, dirName } from '../lib/text'

const LOCK_FILE_NAMES: ReadonlySet<string> = new Set(IGNORED_FILES.lockFileNames)

export const isLockFile = (path: string): boolean => {
  const name = baseName(path)
  return LOCK_FILE_NAMES.has(name) || IGNORED_FILES.lockFileSuffixes.some(suffix => name.endsWith(suffix))
}

type GitHost = Pick<EngineInterface, 'process'>

// `git check-ignore` from the file's own folder. Outside a repo, or where git
// cannot run, nothing counts as ignored.
async function isGitIgnored($: GitHost, path: string): Promise<boolean> {
  try {
    const ran = await $.process.run(['git', 'check-ignore', '-q', '--', path], {
      cwd: dirName(path),
      timeoutMs: IGNORED_FILES.gitCheckTimeoutMs,
    })
    return ran.exitCode === 0
  } catch {
    return false
  }
}

// Remembers git's answer per path, so each file is asked about once.
export class IgnoredFileCache {
  private answers = new Map<string, boolean>()

  get(path: string): boolean | undefined {
    return this.answers.get(path)
  }

  set(path: string, ignored: boolean): void {
    this.answers.set(path, ignored)
  }
}

// A lock file, or a file git ignores (asked once per path, through `cache`).
export async function isIgnoredFile($: GitHost, path: string, cache: IgnoredFileCache): Promise<boolean> {
  if (isLockFile(path)) return true
  const known = cache.get(path)
  if (known !== undefined) return known
  const ignored = await isGitIgnored($, path)
  cache.set(path, ignored)
  return ignored
}

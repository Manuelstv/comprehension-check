// Semantic versions: X.Y.Z with an optional -pre-release.

import { asRecord } from './values'

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/

export const isVersion = (value: unknown): value is string => typeof value === 'string' && SEMVER.test(value)

// True when `a` is a later version than `b`. A pre-release sorts below its release.
export const isNewerVersion = (a: string, b: string): boolean => {
  const pa = SEMVER.exec(a)
  const pb = SEMVER.exec(b)
  if (pa === null || pb === null) return false
  for (let i = 1; i <= 3; i += 1) {
    const diff = Number(pa[i]) - Number(pb[i])
    if (diff !== 0) return diff > 0
  }
  return !a.includes('-') && b.includes('-')
}

// The `version` of a JSON manifest such as plugin.json, when it is valid semver.
export const versionInManifest = (json: string): string | undefined => {
  try {
    const version = asRecord(JSON.parse(json))?.version
    return isVersion(version) ? version : undefined
  } catch {
    return undefined
  }
}

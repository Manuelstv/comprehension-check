// `/quiz version` and `/quiz update`: the installed version, the latest one
// on GitHub, and updating through the `claude` CLI.

import type { EngineInterface } from 'claude-code'

import { COMMAND_NAME, PLUGIN_NAME, SELF_UPDATE } from '../config'
import { lastNonEmptyLine } from '../lib/text'
import { isNewerVersion, versionInManifest } from '../lib/semver'

type VersionHost = Pick<EngineInterface, 'fs' | 'http' | 'plugin'>
type UpdateHost = VersionHost & Pick<EngineInterface, 'process'>

async function installedVersion($: VersionHost) {
  try {
    const text = await $.fs.read(`${$.plugin.root}/${SELF_UPDATE.manifestPath}`)
    return typeof text === 'string' ? versionInManifest(text) : undefined
  } catch {
    return undefined
  }
}

async function latestVersion($: VersionHost) {
  try {
    const res = await $.http.fetch(SELF_UPDATE.latestManifestUrl)
    return res.ok ? versionInManifest(res.text) : undefined
  } catch {
    return undefined
  }
}

function bothVersions($: VersionHost) {
  return Promise.all([installedVersion($), latestVersion($)])
}

const MANUAL_UPDATE = `Update from a shell instead:\n${SELF_UPDATE.commands.map(argv => `  ${argv.join(' ')}`).join('\n')}`

export async function versionReport($: VersionHost): Promise<string> {
  const [installed, latest] = await bothVersions($)
  const have = `${PLUGIN_NAME} ${installed === undefined ? '(version unknown)' : `v${installed}`}`
  if (latest === undefined) return `${have}. Could not check for a newer version.`
  if (installed === undefined || isNewerVersion(latest, installed)) {
    return `${have}. v${latest} is available: run /${COMMAND_NAME} update.`
  }
  return `${have}, the latest version.`
}

// Runs the update commands in order; stops at the first one that fails. When
// both versions are known and nothing is newer, runs none.
export async function runSelfUpdate($: UpdateHost): Promise<string> {
  const [installed, latest] = await bothVersions($)
  if (installed !== undefined && latest !== undefined && !isNewerVersion(latest, installed)) {
    return `${PLUGIN_NAME} v${installed} is already the latest version.`
  }
  for (const argv of SELF_UPDATE.commands) {
    const shown = argv.join(' ')
    let ran
    try {
      ran = await $.process.run(argv, { timeoutMs: SELF_UPDATE.timeoutMs })
    } catch {
      return `Could not run \`${shown}\` here. ${MANUAL_UPDATE}`
    }
    if (ran.exitCode !== 0) {
      const why = lastNonEmptyLine(ran.stderr) ?? lastNonEmptyLine(ran.stdout)
      return `\`${shown}\` failed${why === undefined ? '' : `: ${why}`}. ${MANUAL_UPDATE}`
    }
  }
  const from = installed === undefined ? '' : ` from v${installed}`
  const to = latest === undefined ? '' : ` to v${latest}`
  return `Updated ${PLUGIN_NAME}${from}${to}. Run /reload-plugins or restart Claude Code to load it.`
}

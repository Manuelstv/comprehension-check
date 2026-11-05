// What the gate dialog's banner shows while the dialog is open. The mod
// loader needs each atom declared in the file that reads or writes it, with
// its plugin and key as string literals, so this file owns it.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Gate } from '../../types'

const gateState = atom({ plugin: 'comprehension-check', key: 'gate' } as const, null)

export async function showGateInfo($: EngineInterface, info: Gate) {
  await update($, gateState, () => info)
}

export async function clearGateInfo($: EngineInterface) {
  await update($, gateState, () => null)
}

export async function readGateInfo($: EngineInterface): Promise<Gate | null> {
  return read($, gateState)
}

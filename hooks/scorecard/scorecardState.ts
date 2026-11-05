// Session state behind the scorecard drawing: the count-up in progress and
// the stats each card showed. The mod loader needs each atom declared in the
// file that reads or writes it, with its plugin and key as string literals,
// so this file owns both.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Anim, CardStats } from '../../types'
import { SCORECARD } from '../config'

const countUpState = atom({ plugin: 'comprehension-check', key: 'anim' } as const, null)
const cardStatsState = atom({ plugin: 'comprehension-check', key: 'cards' } as const, {}, { shape: 'cards-1' })

// Counts the score up frame by frame, then leaves the card still.
export async function startCountUp($: EngineInterface, id: string) {
  await update($, countUpState, () => ({ id, frame: 0 }))
  const timer = $.clock.every(SCORECARD.frameMs, () => {
    void update($, countUpState, a => {
      if (a === null || a.id !== id) return a
      if (a.frame + 1 >= SCORECARD.frames) {
        timer.cancel()
        return null
      }
      return { id, frame: a.frame + 1 }
    })
  })
}

export async function readCountUp($: EngineInterface): Promise<Anim | null> {
  return read($, countUpState)
}

// Keeps the stats a card showed, for its redraws; only the latest cards are kept.
export async function saveCardStats($: EngineInterface, id: string, stats: CardStats) {
  await update($, cardStatsState, all =>
    Object.fromEntries([...Object.entries(all), [id, stats]].slice(-SCORECARD.keptCards)),
  )
}

export async function readCardStats($: EngineInterface, id: string): Promise<CardStats | undefined> {
  return (await read($, cardStatsState))[id]
}

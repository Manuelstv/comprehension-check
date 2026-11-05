// Lifetime quiz stats, kept in the mod's persistent store.

import type { EngineInterface } from 'claude-code'

import type { CardStats } from '../../types'
import { SCORECARD, STORE_KEYS } from '../config'
import { asRecord, finiteNumber } from '../lib/values'

type StoredStats = { quizzes: number; totalPct: number; streak: number; best: number }

type StatsStore = Pick<EngineInterface, 'store'>

async function readStored($: StatsStore): Promise<StoredStats> {
  const s = asRecord(await $.store.get(STORE_KEYS.stats))
  return {
    quizzes: finiteNumber(s?.quizzes),
    totalPct: finiteNumber(s?.totalPct),
    streak: finiteNumber(s?.streak),
    best: finiteNumber(s?.best),
  }
}

const forDisplay = (s: StoredStats): CardStats => ({
  quizzes: s.quizzes,
  average: s.quizzes === 0 ? 0 : Math.round(s.totalPct / s.quizzes),
  streak: s.streak,
  best: s.best,
})

export async function readStats($: StatsStore): Promise<CardStats> {
  return forDisplay(await readStored($))
}

// Adds one graded quiz and returns the stats after it.
export async function recordQuizScore($: StatsStore, pct: number): Promise<CardStats> {
  const prev = await readStored($)
  const next: StoredStats = {
    quizzes: prev.quizzes + 1,
    totalPct: prev.totalPct + pct,
    streak: pct >= SCORECARD.greatPct ? prev.streak + 1 : 0,
    best: Math.max(prev.best, pct),
  }
  await $.store.set(STORE_KEYS.stats, next)
  return forDisplay(next)
}

export const statsLine = (s: CardStats): string =>
  s.quizzes === 0
    ? 'No quizzes graded yet.'
    : `${s.quizzes} quiz${s.quizzes === 1 ? '' : 'zes'} · average ${s.average}% · best ${s.best}% · streak ${s.streak} (${SCORECARD.greatPct}%+ in a row)`

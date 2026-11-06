// Lifetime quiz stats, kept in the mod's persistent store.

import type { EngineInterface } from 'claude-code'

import type { CardStats } from '../../types'
import { SCORECARD, SPARK_GLYPHS, STORE_KEYS } from '../config'
import { asRecord, finiteNumber } from '../lib/values'

// `recent`: the latest scores, oldest first, at most SCORECARD.trend.
type StoredStats = { quizzes: number; totalPct: number; streak: number; best: number; recent: number[] }

type StatsStore = Pick<EngineInterface, 'store'>

const scoresIn = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)) : []

async function readStored($: StatsStore): Promise<StoredStats> {
  const s = asRecord(await $.store.get(STORE_KEYS.stats))
  return {
    quizzes: finiteNumber(s?.quizzes),
    totalPct: finiteNumber(s?.totalPct),
    streak: finiteNumber(s?.streak),
    best: finiteNumber(s?.best),
    recent: scoresIn(s?.recent).slice(-SCORECARD.trend),
  }
}

const forDisplay = (s: StoredStats): CardStats => ({
  quizzes: s.quizzes,
  average: s.quizzes === 0 ? 0 : Math.round(s.totalPct / s.quizzes),
  streak: s.streak,
  best: s.best,
  recent: s.recent,
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
    recent: [...prev.recent, pct].slice(-SCORECARD.trend),
  }
  await $.store.set(STORE_KEYS.stats, next)
  return forDisplay(next)
}

// One glyph per score, 0% lowest and 100% highest: "▂▅▃█".
export const sparkline = (scores: readonly number[]): string =>
  scores
    .map(pct => SPARK_GLYPHS[Math.round((Math.max(0, Math.min(100, pct)) / 100) * (SPARK_GLYPHS.length - 1))])
    .join('')

// Shown only once there are two scores to compare.
const trendPart = (s: CardStats) => ((s.recent?.length ?? 0) >= 2 ? ` · last ${s.recent!.length} ${sparkline(s.recent!)}` : '')

export const statsLine = (s: CardStats): string =>
  s.quizzes === 0
    ? 'No quizzes graded yet.'
    : `${s.quizzes} quiz${s.quizzes === 1 ? '' : 'zes'} · average ${s.average}% · best ${s.best}% · streak ${s.streak} (${SCORECARD.greatPct}%+ in a row)${trendPart(s)}`

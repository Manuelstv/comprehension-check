// The grades Claude reports through the scorecard tool, and the score they make.

import { SCORE_TIERS, VERDICTS } from '../config'
import type { ScoreTier, Verdict } from '../config'
import { asRecord, nonEmptyString } from '../lib/values'

export type GradedQuestion = {
  question: string
  verdict: Verdict
  punchline: string
  explanation: string
  user_answer?: string
  correct_answer?: string
  ref?: string
}

export type QuizResults = { results: GradedQuestion[]; next_step?: string }

const isVerdict = (value: unknown): value is Verdict => typeof value === 'string' && value in VERDICTS

// The tool input as results; items without a valid verdict are dropped, and
// none left means undefined.
export const parseResults = (input: unknown): QuizResults | undefined => {
  const rec = asRecord(input)
  if (!Array.isArray(rec?.results)) return undefined
  const results: GradedQuestion[] = []
  for (const raw of rec.results) {
    const item = asRecord(raw)
    if (!isVerdict(item?.verdict)) continue
    results.push({
      question: nonEmptyString(item.question) ?? `Question ${results.length + 1}`,
      verdict: item.verdict,
      punchline: nonEmptyString(item.punchline) ?? '',
      explanation: nonEmptyString(item.explanation) ?? '',
      user_answer: nonEmptyString(item.user_answer),
      correct_answer: nonEmptyString(item.correct_answer),
      ref: nonEmptyString(item.ref),
    })
  }
  return results.length === 0 ? undefined : { results, next_step: nonEmptyString(rec.next_step) }
}

export const scoreOf = (results: readonly GradedQuestion[]) => {
  const points = results.reduce((sum, r) => sum + VERDICTS[r.verdict].points, 0)
  return { points, pct: Math.round((100 * points) / results.length) }
}

export const tierFor = (pct: number): ScoreTier =>
  SCORE_TIERS.find(tier => pct >= tier.minPct) ?? (SCORE_TIERS[SCORE_TIERS.length - 1] as ScoreTier)

// The tool's input schema, as the model sees it.
export const RESULTS_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '2-6 word label for the question' },
          verdict: { type: 'string', enum: ['correct', 'partial', 'incorrect'] },
          user_answer: { type: 'string', description: "The user's answer, short" },
          correct_answer: { type: 'string', description: 'The right answer, short' },
          punchline: { type: 'string', description: 'One punchy line, 12 words max' },
          explanation: { type: 'string', description: '1-2 sentences: the why and the misconception' },
          ref: { type: 'string', description: 'file:line, when useful' },
        },
        required: ['question', 'verdict', 'punchline', 'explanation'],
      },
    },
    next_step: { type: 'string', description: 'One sentence on what to look at next' },
  },
  required: ['results'],
} as const

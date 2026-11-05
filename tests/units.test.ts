// Unit tests for the mod's pure parts: no engine, no hooks.

import { expect, test } from 'claude-code/testing'

import { ChangeTracker, totalLines } from '../hooks/changes/changeTracker'
import { editedPath, linesChangedBy } from '../hooks/changes/edits'
import { isLockFile } from '../hooks/changes/ignoredFiles'
import { isNewerVersion, versionInManifest } from '../hooks/lib/semver'
import { pickStable } from '../hooks/lib/text'
import {
  fitsQuestionCount,
  knownQuizLength,
  mayNeedRounds,
  questionCountFor,
  questionsForSize,
} from '../hooks/quiz/questionCount'
import { LENSES, QUIZ_GOAL, quizInstructions } from '../hooks/quiz/prompts'
import { QuizRounds } from '../hooks/quiz/quizRounds'
import { TurnReminders } from '../hooks/quiz/turnReminders'
import { parseResults, scoreOf, tierFor } from '../hooks/scorecard/grading'
import { SETTING_DEFINITIONS } from '../hooks/settings/definitions'
import { SETTINGS_USAGE } from '../hooks/settings/settings'
import { fileListLine, fitRows } from '../hooks/ui/bannerLines'

test('semver: later versions are newer, a pre-release is below its release', async () => {
  expect(isNewerVersion('0.3.0', '0.2.9')).toBe(true)
  expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true)
  expect(isNewerVersion('0.2.0', '0.2.0')).toBe(false)
  expect(isNewerVersion('0.3.0', '0.3.0-beta.1')).toBe(true)
  expect(isNewerVersion('0.3.0-beta.1', '0.3.0')).toBe(false)
  expect(isNewerVersion('garbage', '0.1.0')).toBe(false)
})

test('semver: the version is read from a manifest, or nothing', async () => {
  expect(versionInManifest('{"version": "1.2.3"}')).toBe('1.2.3')
  expect(versionInManifest('{"version": "v1"}')).toBeUndefined()
  expect(versionInManifest('not json')).toBeUndefined()
})

test('lock files are known by name or by a .lock ending', async () => {
  expect(isLockFile('/repo/pnpm-lock.yaml')).toBe(true)
  expect(isLockFile('/repo/go.sum')).toBe(true)
  expect(isLockFile('/repo/vendor/thing.lock')).toBe(true)
  expect(isLockFile('/repo/lockfile.ts')).toBe(false)
  expect(isLockFile('/repo/package.json')).toBe(false)
})

test('edits: the path and the lines a diff would count', async () => {
  const edit = { tool: 'Edit', file_path: '/a.ts', old_string: 'a\nb', new_string: 'c' }
  expect(editedPath(edit)).toBe('/a.ts')
  expect(linesChangedBy(edit)).toBe(3)
  expect(linesChangedBy({ tool: 'Write', file_path: '/b.ts', content: 'x\ny\nz' })).toBe(3)
  expect(editedPath({ tool: 'NotebookEdit', notebook_path: '/n.ipynb' })).toBe('/n.ipynb')
  expect(linesChangedBy({ tool: 'Bash', command: 'ls' })).toBe(0)
})

test('size mode: 1 question per 100 changed lines, at least 1, never above the max', async () => {
  expect(questionsForSize(0, 4)).toBe(1)
  expect(questionsForSize(100, 4)).toBe(1)
  expect(questionsForSize(101, 4)).toBe(2)
  expect(questionsForSize(350, 4)).toBe(4)
  expect(questionsForSize(900, 4)).toBe(4)
  expect(questionsForSize(900, 12)).toBe(9)
})

test('question count follows the settings, and a quiz round must fit it', async () => {
  const changes = new Map([['/a.ts', 150]])
  const sized = questionCountFor({ sound: true, maxQuestions: 4, sizing: 'size' }, changes)
  expect(sized).toEqual({ mode: 'size', exact: 2, files: 1, lines: 150 })
  expect(fitsQuestionCount(sized, 2)).toBe(true)
  expect(fitsQuestionCount(sized, 1)).toBe(false)

  const agent = questionCountFor({ sound: true, maxQuestions: 3, sizing: 'agent' }, changes)
  expect(fitsQuestionCount(agent, 3)).toBe(true)
  expect(fitsQuestionCount(agent, 4)).toBe(false)
  expect(mayNeedRounds(agent)).toBe(false)

  const long = questionCountFor({ sound: true, maxQuestions: 10, sizing: 'agent' }, changes)
  expect(fitsQuestionCount(long, 4, 4)).toBe(true)
  expect(fitsQuestionCount(long, 3, 8)).toBe(false)
  expect(fitsQuestionCount(long, 5)).toBe(false)
  expect(mayNeedRounds(long)).toBe(true)
  expect(knownQuizLength(long, 4)).toBeUndefined()
  expect(knownQuizLength(long, 3)).toBe(3)

  const big = { mode: 'size' as const, exact: 6, files: 1, lines: 550 }
  expect(fitsQuestionCount(big, 4)).toBe(true)
  expect(fitsQuestionCount(big, 2)).toBe(false)
  expect(fitsQuestionCount(big, 2, 4)).toBe(true)
  expect(knownQuizLength(big, 4)).toBe(6)
})

test('change tracker: pending, handed to Stop, then forgotten', async () => {
  const changes = new ChangeTracker()
  changes.record('/a.ts', 2)
  changes.record('/a.ts', 3)
  expect(totalLines(changes.owed)).toBe(5)

  changes.handToStop(changes.takePending())
  expect(changes.hasPending()).toBe(false)
  expect([...changes.owed.keys()]).toEqual(['/a.ts'])

  changes.forget()
  expect(changes.owed.size).toBe(0)
})

test('turn reminders: the first note once, then only when the count grows', async () => {
  const reminders = new TurnReminders()
  const sized = (exact: number) => ({ mode: 'size' as const, exact, files: 1, lines: 1 })
  expect(reminders.noteFor(sized(2))).toBe('first-edit')
  expect(reminders.noteFor(sized(2))).toBeUndefined()
  expect(reminders.noteFor(sized(3))).toBe('change-grew')
  expect(reminders.noteFor({ mode: 'agent', max: 4 })).toBeUndefined()

  reminders.startTurn()
  expect(reminders.noteFor({ mode: 'agent', max: 4 })).toBe('first-edit')
})

test('grading: invalid items are dropped, partial is half a point', async () => {
  const parsed = parseResults({
    results: [
      { verdict: 'correct', question: 'A' },
      { verdict: 'partial' },
      { verdict: 'great' },
    ],
  })
  expect(parsed?.results.length).toBe(2)
  expect(parsed?.results[1]?.question).toBe('Question 2')
  expect(scoreOf(parsed?.results ?? [])).toEqual({ points: 1.5, pct: 75 })
  expect(parseResults({ results: [] })).toBeUndefined()
})

test('score tiers: each score gets the highest tier it reaches', async () => {
  expect(tierFor(100).emoji).toBe('🏆')
  expect(tierFor(80).emoji).toBe('🔥')
  expect(tierFor(50).emoji).toBe('💪')
  expect(tierFor(1).emoji).toBe('🌱')
  expect(tierFor(0).emoji).toBe('💥')
})

test('banner lines: the first line always fits, the file list stays on one row', async () => {
  expect(fitRows(['x'.repeat(200), 'y'], 2)).toEqual(['x'.repeat(200)])
  expect(fileListLine([])).toBeUndefined()
  expect(fileListLine(['/r/a.ts', '/r/b.ts'])).toBe('On: a.ts, b.ts')
  const many = Array.from({ length: 12 }, (_, i) => `/r/file-${i}.ts`)
  expect(fileListLine(many)).toMatch(/\(\+\d+\)$/)
})

test('settings usage lists every setting with its values', async () => {
  expect(SETTINGS_USAGE).toContain('/quiz settings sound on|off')
  expect(SETTINGS_USAGE).toContain('/quiz settings max 1-99')
  expect(SETTINGS_USAGE).toContain('/quiz settings length claude|size')
  expect(SETTINGS_USAGE).toContain('/quiz settings perspective mixed|code|architect|product')
})

test('perspective: parsed from its aliases, stepped round, read back from the store', async () => {
  const perspective = SETTING_DEFINITIONS.find(def => def.key === 'perspective')!
  expect(perspective.defaultValue).toBe('mixed')
  expect(perspective.parse('architect')).toBe('architecture')
  expect(perspective.parse('pm')).toBe('product')
  expect(perspective.parse('dev')).toBe('code')
  expect(perspective.parse('ux')).toBeUndefined()
  expect(perspective.step('product', 1)).toBe('mixed')
  expect(perspective.step('mixed', -1)).toBe('product')
  expect(perspective.fromStore('code')).toBe('code')
  expect(perspective.fromStore('qa')).toBeUndefined()
})

// The prompt's structure: each rule the evals grade a quiz against must
// actually be in the text Claude gets. evals/ checks what Claude does with it.
test('quiz instructions: goal first, the chosen lens only, and the critical-thinking rules', async () => {
  const agent = { mode: 'agent' as const, max: 4 }
  const mixed = quizInstructions(agent, 'mixed')
  expect(mixed).toContain(QUIZ_GOAL)
  for (const lens of Object.values(LENSES)) expect(mixed).toContain(`${lens.name} (${lens.focus})`)
  expect(mixed).toContain('use at least two lenses')

  for (const [key, lens] of Object.entries(LENSES)) {
    const text = quizInstructions(agent, key as keyof typeof LENSES)
    expect(text).toContain(`Perspective: ${lens.name}.`)
    for (const angle of lens.angles) expect(text).toContain(angle)
    for (const other of Object.values(LENSES).filter(l => l !== lens)) expect(text).not.toContain(other.angles[0]!)
  }

  for (const rule of [
    'If someone could answer it without having seen the change, rewrite it',
    'a decision Claude made that the user did not ask for',
    'what they prove and what they would miss',
    'Do NOT mark the correct answer',
    'Grade the reasoning, not the wording',
    'never just "review the code"',
    'Do not edit any files during the quiz',
  ]) {
    expect(mixed).toContain(rule)
  }
  expect(mixed).toContain('{"source": "comprehension-check"}')
  expect(quizInstructions({ mode: 'agent', max: 10 }, 'code')).toContain('rounds of 4')
})

test('settings: ←/→ steps each value, the max within 1-99', async () => {
  const [sound, max, length] = SETTING_DEFINITIONS
  expect(sound!.step(true, 1)).toBe(false)
  expect(max!.step(4, 1)).toBe(5)
  expect(max!.step(1, -1)).toBe(1)
  expect(max!.step(99, 1)).toBe(99)
  expect(length!.step('agent', -1)).toBe('size')
  expect(max!.parse('07')).toBe(7)
  expect(max!.parse('0')).toBeUndefined()
  expect(max!.parse('none')).toBeUndefined()
  expect(length!.hint('size')).toBe('1 question per 100 changed lines. Never more than the max.')
})

test('a stable pick: the same seed, the same line', async () => {
  const pool = ['a', 'b', 'c']
  expect(pickStable(pool, 'seed')).toBe(pickStable(pool, 'seed'))
})

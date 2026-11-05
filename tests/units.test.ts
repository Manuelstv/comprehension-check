// Unit tests for the mod's pure parts: no engine, no hooks.

import { expect, test } from 'claude-code/testing'

import { ChangeTracker, totalLines } from '../hooks/changes/changeTracker'
import { editedPath, linesChangedBy } from '../hooks/changes/edits'
import { isLockFile } from '../hooks/changes/ignoredFiles'
import { isNewerVersion, versionInManifest } from '../hooks/lib/semver'
import { pickStable } from '../hooks/lib/text'
import { fitsQuestionCount, questionCountFor, questionsForSize } from '../hooks/quiz/questionCount'
import { TurnReminders } from '../hooks/quiz/turnReminders'
import { parseResults, scoreOf, tierFor } from '../hooks/scorecard/grading'
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

test('size mode: one question more per step reached, capped by the max', async () => {
  expect(questionsForSize(1, 10, 4)).toBe(2)
  expect(questionsForSize(3, 10, 4)).toBe(3)
  expect(questionsForSize(1, 80, 4)).toBe(3)
  expect(questionsForSize(6, 0, 4)).toBe(4)
  expect(questionsForSize(1, 300, 3)).toBe(3)
})

test('question count follows the settings, and a quiz must fit it', async () => {
  const changes = new Map([['/a.ts', 100]])
  const sized = questionCountFor({ sound: true, maxQuestions: 4, sizing: 'size' }, changes)
  expect(sized).toEqual({ mode: 'size', exact: 3, files: 1, lines: 100 })
  expect(fitsQuestionCount(sized, 3)).toBe(true)
  expect(fitsQuestionCount(sized, 2)).toBe(false)

  const agent = questionCountFor({ sound: true, maxQuestions: 3, sizing: 'agent' }, changes)
  expect(fitsQuestionCount(agent, 3)).toBe(true)
  expect(fitsQuestionCount(agent, 4)).toBe(false)
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
  expect(SETTINGS_USAGE).toContain('/quiz settings questions 2|3|4')
  expect(SETTINGS_USAGE).toContain('/quiz settings count agent|size')
})

test('a stable pick: the same seed, the same line', async () => {
  const pool = ['a', 'b', 'c']
  expect(pickStable(pool, 'seed')).toBe(pickStable(pool, 'seed'))
})

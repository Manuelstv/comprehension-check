// Unit tests for the mod's pure parts: no engine, no hooks.

import { expect, test } from 'claude-code/testing'

import { largestFirst, mergeChanges, withoutLockFiles } from '../hooks/changes/changeSets'
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
import { LENSES, QUIZ_GOAL, quizInstructions, requestedQuizNote } from '../hooks/quiz/prompts'
import { QuizRequest } from '../hooks/quiz/quizRequest'
import { QuizRounds } from '../hooks/quiz/quizRounds'
import { TurnReminders } from '../hooks/quiz/turnReminders'
import { parseResults, scoreOf, tierFor } from '../hooks/scorecard/grading'
import type { ScopeSnapshot } from '../hooks/scopes/collectScope'
import { parseLog, parseNumstat, parseNumstatRow, parsePathList } from '../hooks/scopes/gitOutput'
import { requestSummary, subjectOf } from '../hooks/scopes/scopeText'
import { SCOPES_USAGE, describeScope, parseScope } from '../hooks/scopes/scopes'
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

// ─── On-demand quizzes ───────────────────────────────────────────────────────

test('scopes: last [n], uncommitted and codebase, with their aliases', async () => {
  expect(parseScope('last', [])).toEqual({ scope: { kind: 'commits', count: 1 } })
  expect(parseScope('last', ['5'])).toEqual({ scope: { kind: 'commits', count: 5 } })
  expect(parseScope('commits', ['100'])).toEqual({ scope: { kind: 'commits', count: 100 } })
  expect(parseScope('diff', [])).toEqual({ scope: { kind: 'uncommitted' } })
  expect(parseScope('all', [])).toEqual({ scope: { kind: 'codebase' } })
  for (const bad of ['0', '101', '2.5', 'many']) expect(parseScope('last', [bad])).toHaveProperty('error')
  expect(parseScope('stats', [])).toBeUndefined()

  expect(describeScope({ kind: 'commits', count: 1 })).toBe('the last commit')
  expect(describeScope({ kind: 'commits', count: 3 })).toBe('the last 3 commits')
  expect(SCOPES_USAGE).toBe('/quiz last [1-100], /quiz uncommitted, /quiz codebase')
})

test('git output: numstat rows, binaries skipped, a log split into commits and lines', async () => {
  expect(parseNumstatRow('3\t2\tsrc/a b.ts')).toEqual({ path: 'src/a b.ts', lines: 5 })
  expect(parseNumstatRow('-\t-\tlogo.png')).toBeUndefined()
  expect(parseNumstatRow('')).toBeUndefined()

  expect([...parseNumstat('1\t1\ta.ts\n-\t-\tb.png\n4\t0\tc.ts\n')]).toEqual([
    ['a.ts', 2],
    ['c.ts', 4],
  ])

  const log = parseLog('@\tabc1234\tfix: a\tb\n\n2\t1\ta.ts\n@\tdef5678\tfeat: c\n\n4\t0\ta.ts\n1\t0\tc.ts\n')
  expect(log.commits).toEqual([
    { hash: 'abc1234', subject: 'fix: a\tb' },
    { hash: 'def5678', subject: 'feat: c' },
  ])
  expect([...log.changes]).toEqual([
    ['a.ts', 7],
    ['c.ts', 1],
  ])
  expect(parsePathList('new.ts\0dir/x y.md\0')).toEqual(['new.ts', 'dir/x y.md'])
})

test('change sets: merged per path, lock files dropped, largest first', async () => {
  const merged = mergeChanges(new Map([['a.ts', 2]]), new Map([['a.ts', 3], ['pnpm-lock.yaml', 900], ['b.ts', 5]]))
  expect(merged.get('a.ts')).toBe(5)
  const kept = withoutLockFiles(merged)
  expect(kept.has('pnpm-lock.yaml')).toBe(false)
  expect(largestFirst(kept)).toEqual([
    ['a.ts', 5],
    ['b.ts', 5],
  ])
})

test('quiz request: queued, submitted once, kept for its own turn, dropped by the next', async () => {
  const request = new QuizRequest()
  const changes = new Map([['a.ts', 10]])
  request.open(changes, 'Quiz me.')
  // A turn starting before the prompt went in does not count as its turn.
  request.startTurn()
  expect(request.takePrompt()).toBe('Quiz me.')
  expect(request.takePrompt()).toBeUndefined()
  request.startTurn()
  expect(request.requested).toBe(changes)
  request.startTurn()
  expect(request.requested).toBeUndefined()

  request.open(changes, 'Quiz me.')
  request.close()
  expect(request.takePrompt()).toBeUndefined()
  expect(request.requested).toBeUndefined()
})

const snapshot = (over: Partial<ScopeSnapshot> = {}): ScopeSnapshot => ({
  scope: { kind: 'commits', count: 2 },
  changes: new Map([
    ['src/a.ts', 120],
    ['src/b.ts', 1],
  ]),
  commits: [
    { hash: 'abc1234', subject: 'fix: a' },
    { hash: 'def5678', subject: 'feat: b' },
  ],
  untracked: [],
  ...over,
})

test('scope text: commits named, how to read them, files largest first', async () => {
  const subject = subjectOf(snapshot())
  expect(subject.what).toBe('the last 2 commits (abc1234 fix: a; def5678 feat: b)')
  expect(subject.howToRead).toContain('git show --no-renames abc1234 def5678')
  expect(subject.fileLines).toEqual(['src/a.ts (120 lines)', 'src/b.ts (1 line)'])
  expect(subject).toMatchObject({ files: 2, lines: 121, moreFiles: 0, isWholeCode: false })

  const wip = subjectOf(snapshot({ scope: { kind: 'uncommitted' }, commits: [], untracked: ['src/b.ts'] }))
  expect(wip.fileLines[1]).toBe('src/b.ts (1 line, new)')
  expect(wip.howToRead).toContain('git diff HEAD')

  const many = new Map(Array.from({ length: 35 }, (_, i) => [`f${i}.ts`, i + 1] as [string, number]))
  const whole = subjectOf(snapshot({ scope: { kind: 'codebase' }, changes: many, commits: [] }))
  expect(whole.fileLines.length).toBe(30)
  expect(whole.fileLines[0]).toBe('f34.ts (35 lines)')
  expect(whole.moreFiles).toBe(5)
  expect(whole.isWholeCode).toBe(true)
})

test('scope text: the summary follows the length setting and the perspective', async () => {
  const settings = { sound: true, maxQuestions: 3, sizing: 'agent' as const, perspective: 'product' as const }
  expect(requestSummary(snapshot(), { mode: 'agent', max: 3 }, settings)).toBe(
    '🧠 Quiz on the last 2 commits: 2 files, 121 lines · up to 3 questions · Product perspective.',
  )
  const sized = { mode: 'size' as const, exact: 2, files: 2, lines: 121 }
  expect(requestSummary(snapshot(), sized, { ...settings, sizing: 'size' })).toContain('· 2 questions ·')
})

test('requested quiz note: the scope, how to read it, then the quiz rules without the yes/no step', async () => {
  const note = requestedQuizNote(subjectOf(snapshot()), { mode: 'agent', max: 4 }, 'code')
  expect(note).toContain('[comprehension-check] The user asked to be quizzed on the last 2 commits')
  expect(note).toContain('- src/a.ts (120 lines)')
  expect(note).toContain('"the change" means this diff')
  expect(note).toContain('The user asked for this quiz, so it goes straight to them')
  expect(note).not.toContain('first asks the user whether they want the quiz')
  expect(note).toContain('Perspective: Code')

  const whole = requestedQuizNote(subjectOf(snapshot({ scope: { kind: 'codebase' }, commits: [] })), { mode: 'agent', max: 4 }, 'mixed')
  expect(whole).toContain('not on a recent change')
  // The gated quiz still reads as before, so the evals stay in step.
  expect(quizInstructions({ mode: 'agent', max: 4 }, 'mixed')).toContain('first asks the user whether they want the quiz')
})

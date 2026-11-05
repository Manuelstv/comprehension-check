// The menu plain `/quiz` opens: every subcommand with what it does, picked
// from a dialog, then run as if it had been typed.

import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const
const quiz = (args = '') => ({ command: 'quiz', args, ...RUN })
const EDIT = { tool: 'Edit', file_path: '/repo/a.kt', old_string: 'a', new_string: 'b' } as const

type Asked = { header: string; question: string; options: string[] }

// Stands for the engine beneath the mod: answers each dialog with the next of
// `answers` (a label, or text typed under Other), then dismisses. Git is not
// there, so a quiz on demand says it is not in a repository.
const engine = (on: On, answers: string[]) => {
  const asked: Asked[] = []
  const queue = [...answers]
  mock.store(on)
  on('tool.call', (_, e) => {
    if (e.tool !== 'AskUserQuestion') return { result: {} }
    const q = (e as { questions: { question: string; header: string; options: { label: string }[] }[] }).questions[0]
    asked.push({ header: q?.header ?? '', question: q?.question ?? '', options: (q?.options ?? []).map(o => o.label) })
    const answer = queue.shift()
    return answer === undefined ? { deny: 'dismissed' } : { result: { answers: { [q?.question ?? '']: answer } } }
  })
  on('classic.Stop', () => ({}))
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('command.register', () => ({ value: { command: 'quiz' } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__comprehension-check__${e.name}` } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  mock.session(on)
  return asked
}

const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
// The name before " — what it does" on each row.
const labels = (a: Asked | undefined) => a?.options.map(o => o.split(' — ')[0])
// A row as the dialog shows it, to answer with.
const row = (name: string, what: string) => `${name} — ${what}`
const STATS = row('stats', 'Your record: quizzes, average, best score, streak')
const LAST = row('last', 'Quiz on the last commit, or the last n (1-100)')
const OFF = row('off', 'Turn the automatic quizzes after edits off')

test('/quiz opens a menu: the quizzes on demand first, each with what it does', async ($, on) => {
  const asked = engine(on, [])
  await $.session.start(START)

  const r = await $.command.run(quiz())
  expect(asked[0]?.header).toBe('Quiz')
  expect(asked[0]?.question).toContain("Quizzes after Claude's edits are on")
  expect(labels(asked[0])).toEqual(['last', 'uncommitted', 'codebase', 'More commands…'])
  expect(asked[0]?.options[1]).toBe('uncommitted — Quiz on your staged, unstaged and new files')
  // Esc closes it and shows the status, as before.
  expect(r.text).toContain('Comprehension quiz is on')
})

test('More commands… turns the page; a pick runs as if typed', async ($, on) => {
  const asked = engine(on, ['More commands…', STATS])
  await $.session.start(START)

  const r = await $.command.run(quiz())
  expect(labels(asked[1])).toEqual(['settings', 'stats', 'off', 'More commands…'])
  expect(r.text).toContain('📈')
})

test('the last page goes back to the first', async ($, on) => {
  const asked = engine(on, ['More commands…', 'More commands…', 'Back'])
  await $.session.start(START)

  await $.command.run(quiz())
  expect(labels(asked[2])).toEqual(['version', 'update', 'Back'])
  expect(labels(asked[3])).toEqual(['last', 'uncommitted', 'codebase', 'More commands…'])
})

test('last asks how many commits, then runs that quiz', async ($, on) => {
  const asked = engine(on, [LAST, row('The last 3 commits', 'The 3 most recent commits, together')])
  await $.session.start(START)

  const r = await $.command.run(quiz())
  expect(labels(asked[1])).toEqual(['The last commit', 'The last 3 commits', 'The last 5 commits', 'The last 10 commits'])
  expect(r.text).toContain('a quiz on the last 3 commits')
})

test('text typed under Other runs as a subcommand, a typed count too', async ($, on) => {
  engine(on, ['last 7'])
  await $.session.start(START)
  expect((await $.command.run(quiz())).text).toContain('the last 7 commits')
})

test('a number typed after last becomes the commit count', async ($, on) => {
  engine(on, [LAST, '12'])
  await $.session.start(START)
  expect((await $.command.run(quiz())).text).toContain('the last 12 commits')
})

test('the switch offers whichever way would change the automatic quizzes', async ($, on) => {
  const asked = engine(on, ['More commands…', OFF, 'More commands…'])
  await $.session.start(START)

  expect((await $.command.run(quiz())).text).toBe('Comprehension quiz disabled.')
  await $.command.run(quiz())
  expect(asked[2]?.question).toContain('are off')
  expect(labels(asked[3])).toContain('on')
})

test('the menu dialog does not count as a quiz', async ($, on) => {
  engine(on, [])
  await $.session.start(START)

  await $.tool.call({ ...EDIT, file_path: '/repo/owed.kt' })
  await $.command.run(quiz())
  const r = await $.classic.Stop({ stop_hook_active: false })
  expect(r.block).toContain('/repo/owed.kt')
})

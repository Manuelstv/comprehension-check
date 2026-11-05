import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const EDIT = { tool: 'Edit', file_path: '/repo/a.kt', old_string: 'a', new_string: 'b' } as const

const engine = (on: On, entries?: Record<string, unknown>) => {
  on('tool.call', () => ({ result: {} }))
  on('classic.Stop', () => ({}))
  mock.store(on, entries)
  return mock.session(on)
}

const noteTexts = (session: ReturnType<typeof mock.session>) =>
  session
    .appended()
    .flatMap(row => row.message.content)
    .map(block => ('text' in block ? String(block.text) : ''))

test('the first edit of a turn leaves Claude a quiz reminder, once', async ($, on) => {
  const session = engine(on)

  await $.tool.call(EDIT)
  await $.tool.call({ ...EDIT, file_path: '/repo/b.kt' })

  const notes = noteTexts(session)
  expect(notes.length).toBe(1)
  expect(notes[0]).toContain('AskUserQuestion')
})

test('a turn that edited code and was not quizzed is sent back once', async ($, on) => {
  engine(on)

  await $.tool.call(EDIT)

  const first = await $.classic.Stop({ stop_hook_active: false })
  expect(first.block).toContain('/repo/a.kt')

  const second = await $.classic.Stop({ stop_hook_active: true })
  expect(second.block).toBeUndefined()
})

test('a quiz after the edits means the stop is not blocked', async ($, on) => {
  engine(on)

  await $.tool.call(EDIT)
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] })

  const r = await $.classic.Stop({ stop_hook_active: false })
  expect(r.block).toBeUndefined()
})

test('a turn with no code change ends normally', async ($, on) => {
  const session = engine(on)

  await $.tool.call({ tool: 'Bash', command: 'ls' })

  const r = await $.classic.Stop({ stop_hook_active: false })
  expect(r.block).toBeUndefined()
  expect(noteTexts(session).length).toBe(0)
})

test('a failed edit does not count', async ($, on) => {
  on('tool.call', () => ({ result: {}, isError: true }))
  on('classic.Stop', () => ({}))
  mock.store(on)

  await $.tool.call({ tool: 'Write', file_path: '/repo/b.kt', content: 'x' })

  const r = await $.classic.Stop({ stop_hook_active: false })
  expect(r.block).toBeUndefined()
})

test('/quiz off turns both paths off', async ($, on) => {
  const session = engine(on)
  on('command.register', () => ({ value: { command: 'quiz' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'quiz', args: 'off' })
  await $.tool.call(EDIT)

  const r = await $.classic.Stop({ stop_hook_active: false })
  expect(r.block).toBeUndefined()
  expect(noteTexts(session).length).toBe(0)
})

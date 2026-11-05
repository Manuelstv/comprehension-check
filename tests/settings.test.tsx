// The settings menu: every setting in one list, Enter changes the one picked
// in place, and the list comes back until Esc.

import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const
const quiz = (args: string) => ({ command: 'quiz', args, ...RUN })
const EDIT = { tool: 'Edit', file_path: '/repo/a.kt', old_string: 'a', new_string: 'b' } as const

type Asked = { header: string; question: string; options: string[] }

// Stands for the engine beneath the mod: answers the mod's dialogs with
// `answers` in order, then dismisses.
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
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('command.register', () => ({ value: { command: 'quiz' } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__comprehension-check__${e.name}` } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  mock.session(on)
  return asked
}

const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const

test('Enter on Sound or Length changes it in place, and the list comes back', async ($, on) => {
  const asked = engine(on, ['Sound: On', 'Length: Claude decides', 'Done'])
  await $.session.start(START)

  const r = await $.command.run(quiz('settings'))
  expect(r.text).toContain(
    'Saved. Quiz settings: sound off · at most 4 questions · length fits the change size · mixed perspective.',
  )

  expect(asked.map(a => a.header)).toEqual(['Settings', 'Settings', 'Settings'])
  expect(asked[0]?.options).toEqual([
    'Sound: On',
    'Max questions: 4',
    'Length: Claude decides',
    'Perspective: Mixed',
  ])
  expect(asked[1]?.options[0]).toBe('Sound: Off')
  expect(asked[0]?.question).toContain('Claude weighs how severe and complex the change is')
  expect(asked[2]?.question).toContain('1 question per 100 changed lines')
})

test('Max questions: pick a number, or type one under Other', async ($, on) => {
  const asked = engine(on, ['Max questions: 4', '6', 'Max questions: 6', '12', 'Max questions: 12', 'lots', 'Done'])
  await $.session.start(START)

  const r = await $.command.run(quiz('settings'))
  expect(r.text).toContain('at most 12 questions')
  expect(asked[1]?.options).toEqual(['2', '4 (current)', '6', '8'])
  expect(asked[3]?.question).toContain('Now 6')
})

test('Perspective lists every lens with what it asks, the current one marked', async ($, on) => {
  const asked = engine(on, ['Perspective: Mixed', 'Product', 'Perspective: Product', 'Architecture', 'Done'])
  await $.session.start(START)

  const r = await $.command.run(quiz('settings'))
  expect(r.text).toContain('architecture perspective')
  expect(asked[1]?.header).toBe('Perspective')
  expect(asked[1]?.options).toEqual(['Mixed (current)', 'Code', 'Architecture', 'Product'])
  expect(asked[1]?.question).toContain('Product: What it means for users')
  expect(asked[3]?.options).toContain('Product (current)')
})

test('Perspective: a lens typed under Other is understood; nonsense changes nothing', async ($, on) => {
  engine(on, ['Perspective: Mixed', 'architect', 'Perspective: Architecture', 'sideways', 'Done'])
  await $.session.start(START)

  const r = await $.command.run(quiz('settings'))
  expect(r.text).toContain('architecture perspective')
})

test('Esc at once changes nothing and shows the one-line commands', async ($, on) => {
  engine(on, [])
  await $.session.start(START)
  const r = await $.command.run(quiz('settings'))
  expect(r.text).toContain('No changes')
  expect(r.text).toContain('/quiz settings max 1-99')
})

test('the settings dialogs do not count as a quiz', async ($, on) => {
  engine(on, ['Sound: On', 'Done'])
  await $.session.start(START)

  await $.tool.call({ ...EDIT, file_path: '/repo/owed.kt' })
  await $.command.run(quiz('settings'))
  const r = await $.classic.Stop({ stop_hook_active: false })
  expect(r.block).toContain('/repo/owed.kt')
})

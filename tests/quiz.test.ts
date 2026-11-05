import { expect, mock, test } from 'claude-code/testing'
import type { On, RenderPropsOf } from 'claude-code'

const EDIT = { tool: 'Edit', file_path: '/repo/a.kt', old_string: 'a', new_string: 'b' } as const
// Registered at runtime, so the generated tool types do not list it yet.
const RESULTS_TOOL = 'mcp__comprehension-check__quiz_results'
const RUN = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 100 },
} as const

const QUIZ = {
  tool: 'AskUserQuestion' as const,
  metadata: { source: 'comprehension-check' },
  questions: [
    {
      question: 'Why does a.kt guard the call?',
      header: 'Approach',
      multiSelect: false,
      options: [
        { label: 'A', description: 'a' },
        { label: 'B', description: 'b' },
      ],
    },
    {
      question: 'Which inputs break a.kt?',
      header: 'Edge cases',
      multiSelect: true,
      options: [
        { label: 'C', description: 'c' },
        { label: 'D', description: 'd' },
      ],
    },
  ],
}

const GRADES = {
  results: [
    {
      question: 'Why the guard',
      verdict: 'correct',
      punchline: 'Nailed it: the guard stops the double fire.',
      explanation: 'Without it the hook runs twice.',
      ref: 'a.kt:12',
    },
    {
      question: 'Breaking inputs',
      verdict: 'partial',
      user_answer: 'C',
      correct_answer: 'C and D',
      punchline: 'Half right: D breaks it too.',
      explanation: 'An empty string skips the check.',
    },
  ],
  next_step: 'Read the guard in a.kt.',
} as const

type Seen = { gate: string[]; quiz: number }

// Stands for the engine beneath the mod. The gate is the mod's own
// AskUserQuestion, answered with `gateAnswer`.
const engine = (on: On, gateAnswer: string | 'dismiss' = 'Yes, quiz me') => {
  const seen: Seen = { gate: [], quiz: 0 }
  on('tool.call', (_, e) => {
    if (e.tool === 'AskUserQuestion') {
      const qs = (e as { questions: { question: string; header: string }[] }).questions
      if (qs[0]?.header === 'Quiz time') {
        seen.gate.push(qs[0].question)
        if (gateAnswer === 'dismiss') return { deny: 'dismissed' }
        return { result: { questions: qs, answers: { [qs[0].question]: gateAnswer } } }
      }
      seen.quiz += 1
    }
    return { result: {} }
  })
  on('classic.Stop', () => ({}))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__comprehension-check__${e.name}` } }))
  on('command.register', () => ({ value: { command: 'quiz' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  mock.store(on)
  const session = mock.session(on)
  return { seen, session }
}

const noteTexts = (session: ReturnType<typeof mock.session>) =>
  session
    .appended()
    .flatMap(row => row.message.content)
    .map(block => ('text' in block ? String(block.text) : ''))

const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const

test('the first edit of a turn leaves Claude a quiz reminder, once', async ($, on) => {
  const { session } = engine(on)

  await $.tool.call(EDIT)
  await $.tool.call({ ...EDIT, file_path: '/repo/b.kt' })

  const notes = noteTexts(session)
  expect(notes.length).toBe(1)
  expect(notes[0]).toContain('AskUserQuestion')
  expect(notes[0]).toContain(RESULTS_TOOL)
})

test('a turn that edited code and was not quizzed is sent back once', async ($, on) => {
  engine(on)

  await $.tool.call(EDIT)

  const first = await $.classic.Stop({ stop_hook_active: false })
  expect(first.block).toContain('/repo/a.kt')

  const second = await $.classic.Stop({ stop_hook_active: true })
  expect(second.block).toBeUndefined()
})

test('the quiz asks yes or no first, and a yes runs it', async ($, on) => {
  const { seen } = engine(on, 'Yes, quiz me')

  await $.tool.call(EDIT)
  const ran = await $.tool.call(QUIZ)

  expect(seen.gate.length).toBe(1)
  expect(seen.gate[0]).toContain('2 quick questions')
  expect(seen.quiz).toBe(1)
  expect(ran.deny).toBeUndefined()

  const r = await $.classic.Stop({ stop_hook_active: false })
  expect(r.block).toBeUndefined()
})

test('a no at the gate skips the quiz and the turn ends', async ($, on) => {
  const { seen } = engine(on, 'Not now')

  await $.tool.call(EDIT)
  const ran = await $.tool.call(QUIZ)

  expect(seen.quiz).toBe(0)
  expect(ran.deny).toContain('skip')
  const r = await $.classic.Stop({ stop_hook_active: false })
  expect(r.block).toBeUndefined()
})

test('dismissing the gate counts as a no', async ($, on) => {
  const { seen } = engine(on, 'dismiss')

  await $.tool.call(EDIT)
  const ran = await $.tool.call(QUIZ)

  expect(seen.quiz).toBe(0)
  expect(ran.deny).toContain('skip')
})

test('a question without the quiz source passes straight through', async ($, on) => {
  const { seen } = engine(on)

  await $.tool.call({ ...QUIZ, metadata: undefined })

  expect(seen.gate.length).toBe(0)
  expect(seen.quiz).toBe(1)
})

test('a turn with no code change ends normally', async ($, on) => {
  const { session } = engine(on)

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
  const { session } = engine(on)

  await $.session.start(START)
  await $.command.run({ command: 'quiz', args: 'off', ...RUN })
  await $.tool.call(EDIT)

  const r = await $.classic.Stop({ stop_hook_active: false })
  expect(r.block).toBeUndefined()
  expect(noteTexts(session).length).toBe(0)
})

test('the scorecard tool is allowed, scores the quiz and keeps stats', async ($, on) => {
  engine(on)
  await $.session.start(START)

  const check = await $.tool.check({ tool: RESULTS_TOOL, input: GRADES })
  expect(check.decision).toBe('allow')

  const ran = await $.tool.call({ tool: RESULTS_TOOL, ...GRADES } as never)
  expect(String(ran.result)).toContain('75%')

  const stats = await $.command.run({ command: 'quiz', args: 'stats', ...RUN })
  expect(stats.text).toContain('1 quiz')
  expect(stats.text).toContain('average 75%')
})

test('a scorecard with no valid grades is refused', async ($, on) => {
  engine(on)

  const ran = await $.tool.call({ tool: RESULTS_TOOL, results: [{ verdict: 'great' }] } as never)
  expect(ran.deny).toContain('results')
})

test('/quiz sound off is kept', async ($, on) => {
  engine(on)
  await $.session.start(START)

  await $.command.run({ command: 'quiz', args: 'sound off', ...RUN })
  const r = await $.command.run({ command: 'quiz', args: 'sound', ...RUN })
  expect(r.text).toContain('off')
})

// Core's own drawing: the dialog must hold it exactly once.
const drawEngine = (on: On) =>
  on('ui.render', ($, e) => {
    if (e.component === 'AskUserQuestion') return { type: 'engine' as const, ref: 0 }
    const { Text } = $.ui.resolve(e)
    return Text({ children: 'engine' })
  })

test('the quiz dialog shows how to answer each question', async ($, on) => {
  drawEngine(on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'comprehension-check',
      surface,
      component: 'AskUserQuestion',
      props: { tool: 'AskUserQuestion', questions: QUIZ.questions, metadataSource: 'comprehension-check' },
    })
    expect((await ui.find({ type: 'Text', text: /COMPREHENSION CHECK/ }))?.text).toContain('2 questions')
    expect((await ui.find({ type: 'Text', text: /Q1 Approach/ }))?.text).toContain('pick one')
    expect((await ui.find({ type: 'Text', text: /Q2 Edge cases/ }))?.text).toContain('pick ALL that apply')
    expect(await ui.find({ type: 'Text', text: /own words/ })).toBeDefined()
    await ui.unmount()
  }
})

test('other questions are drawn as the engine draws them', async ($, on) => {
  drawEngine(on)

  const ui = await $.ui.mount({
    plugin: 'comprehension-check',
    surface: 'terminal',
    component: 'AskUserQuestion',
    props: { tool: 'AskUserQuestion', questions: QUIZ.questions },
  })
  expect(await ui.find({ type: 'Text', text: /COMPREHENSION/ })).toBeUndefined()
  await ui.unmount()
})

test('the scorecard shows the score, verdicts and punchlines', async ($, on) => {
  drawEngine(on)
  const props = {
    tool_use_id: 'tu1',
    tool: RESULTS_TOOL,
    input: GRADES,
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
  } as unknown as RenderPropsOf['ToolUse']

  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({
      plugin: 'comprehension-check',
      surface,
      component: 'ToolUse',
      requestId: 'tu1',
      props,
      viewport: { columns: 100, rows: 40 },
    })
    expect((await ui.find({ type: 'Text', text: /75%/ }))?.text).toContain('1.5/2')
    expect(await ui.find({ type: 'Text', text: /double fire/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /Answer: C and D/ }))?.text).toContain('You said: C')
    expect(await ui.find({ type: 'Text', text: /a\.kt:12/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Read the guard/ })).toBeDefined()
    await ui.unmount()
  }
})

test('under the scorecard is a hint, not the raw result', async ($, on) => {
  drawEngine(on)

  const ui = await $.ui.mount({
    plugin: 'comprehension-check',
    surface: 'terminal',
    component: 'ToolResult',
    props: { tool_use_id: 'tu1', tool: RESULTS_TOOL, output: 'Scorecard shown' } as unknown as RenderPropsOf['ToolResult'],
  })
  expect((await ui.find({ type: 'Text', text: /quiz stats/ }))?.text).toContain('/quiz stats')
  await ui.unmount()
})

test('the scorecard shows the record after a graded quiz', async ($, on) => {
  engine(on)
  drawEngine(on)

  await $.tool.call({ tool: RESULTS_TOOL, tool_use_id: 'tu9', ...GRADES } as never)
  const ui = await $.ui.mount({
    plugin: 'comprehension-check',
    surface: 'terminal',
    component: 'ToolUse',
    requestId: 'tu9',
    props: {
      tool_use_id: 'tu9',
      tool: RESULTS_TOOL,
      input: GRADES,
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
    } as unknown as RenderPropsOf['ToolUse'],
  })
  expect((await ui.find({ type: 'Text', text: /📈/ }))?.text).toContain('1 quiz · average 75%')
  await ui.unmount()
})

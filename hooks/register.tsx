import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CardStats } from '../types'

const PLUGIN = 'comprehension-check'
// Tools whose successful call means "code changed".
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])
const QUIZ_TOOL = 'AskUserQuestion'
// The quiz call carries this as `metadata.source`, so the mod can tell it
// from any other question Claude asks.
const QUIZ_SOURCE = PLUGIN
const RESULTS_NAME = 'quiz_results'
const RESULTS_TOOL = `mcp__${PLUGIN}__${RESULTS_NAME}`
// The registered tool is unknown to the generated types, so match it by pattern.
const RESULTS_MATCH = /^mcp__comprehension-check__quiz_results$/
const COMMAND = 'quiz'

// Where updates come from: the marketplace in this repo, which serves main.
const REPO = 'agharsallah/comprehension-check'
const LATEST_URL = `https://raw.githubusercontent.com/${REPO}/main/.claude-plugin/plugin.json`
const PLUGIN_ID = `${PLUGIN}@${PLUGIN}`
const UPDATE_STEPS = [
  ['claude', 'plugin', 'marketplace', 'update', PLUGIN],
  ['claude', 'plugin', 'update', PLUGIN_ID],
] as const
const UPDATE_TIMEOUT_MS = 120_000
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/

const GATE_HEADER = 'Quiz time'
const YES = 'Yes, quiz me'
const NO = 'Not now'

const ENABLED_KEY = 'enabled'
const SOUND_KEY = 'sound'
const STATS_KEY = 'stats'

// The scorecard's count-up: FRAMES steps of FRAME_MS.
const FRAMES = 18
const FRAME_MS = 70
// Rows the terminal leaves a tree around the question dialog, and the width
// it counts a row at.
const DIALOG_ROWS = 12
const ROW_COLS = 40

const gate = atom({ plugin: 'comprehension-check', key: 'gate' } as const, null)
const anim = atom({ plugin: 'comprehension-check', key: 'anim' } as const, null)
const cards = atom({ plugin: 'comprehension-check', key: 'cards' } as const, {}, { shape: 'cards-1' })

// Files changed since the last quiz, the files the Stop hook asked about, and
// whether this turn already got the mid-turn reminder. Module variables start
// over on a reload, which at worst skips one quiz.
const changed = new Set<string>()
let asked: string[] = []
let isReminded = false

type Verdict = 'correct' | 'partial' | 'incorrect'
type Graded = {
  question: string
  verdict: Verdict
  punchline: string
  explanation: string
  user_answer?: string
  correct_answer?: string
  ref?: string
}
type Results = { results: Graded[]; next_step?: string }
type Stats = { quizzes: number; totalPct: number; streak: number; best: number }
type Question = { header?: string; multiSelect?: boolean }

const isEnabled = async ($: EngineInterface) => (await $.store.get(ENABLED_KEY)) !== false
const isSoundOn = async ($: EngineInterface) => (await $.store.get(SOUND_KEY)) !== false

const asRecord = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined

const pathOf = (input: unknown): string | undefined => {
  const rec = asRecord(input)
  const p = rec?.file_path ?? rec?.notebook_path
  return typeof p === 'string' ? p : undefined
}

const baseName = (p: string) => p.split('/').pop() ?? p

const isQuizCall = (e: unknown) => {
  const rec = asRecord(e)
  return rec?.tool === QUIZ_TOOL && asRecord(rec.metadata)?.source === QUIZ_SOURCE
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)

const parseResults = (input: unknown): Results | undefined => {
  const rec = asRecord(input)
  if (!Array.isArray(rec?.results)) return undefined
  const results: Graded[] = []
  for (const raw of rec.results) {
    const r = asRecord(raw)
    const verdict = r?.verdict
    if (verdict !== 'correct' && verdict !== 'partial' && verdict !== 'incorrect') continue
    results.push({
      question: str(r?.question) ?? `Question ${results.length + 1}`,
      verdict,
      punchline: str(r?.punchline) ?? '',
      explanation: str(r?.explanation) ?? '',
      user_answer: str(r?.user_answer),
      correct_answer: str(r?.correct_answer),
      ref: str(r?.ref),
    })
  }
  return results.length === 0 ? undefined : { results, next_step: str(rec.next_step) }
}

const POINTS: Record<Verdict, number> = { correct: 1, partial: 0.5, incorrect: 0 }
const scoreOf = (results: Graded[]) => {
  const points = results.reduce((sum, r) => sum + POINTS[r.verdict], 0)
  return { points, pct: Math.round((100 * points) / results.length) }
}

// A stable pick from a pool, so a redraw never swaps the line under the reader.
const pick = <T,>(pool: readonly T[], seed: string): T => {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0
  return pool[Math.abs(h) % pool.length] as T
}

type Tier = { emoji: string; color: string; lines: readonly string[]; sound: string }
const tierOf = (pct: number): Tier => {
  if (pct === 100)
    return {
      emoji: '🏆',
      color: 'success',
      sound: 'sounds/fanfare.wav',
      lines: [
        'Flawless. You could have written this diff.',
        'Perfect score. The code fears you.',
        'Clean sweep. Ship it with confidence.',
      ],
    }
  if (pct >= 80)
    return {
      emoji: '🔥',
      color: 'success',
      sound: 'sounds/win.wav',
      lines: ['Sharp! Barely a scratch.', 'Strong read. One nitpick from perfect.', 'You get it. Mostly.'],
    }
  if (pct >= 50)
    return {
      emoji: '💪',
      color: 'warning',
      sound: 'sounds/win.wav',
      lines: [
        'Solid. A couple of blind spots to patch.',
        'Half the battle won. Read the misses.',
        'Decent. The diff still has a secret or two.',
      ],
    }
  if (pct > 0)
    return {
      emoji: '🌱',
      color: 'warning',
      sound: 'sounds/miss.wav',
      lines: ['Getting there. Worth a second pass.', 'Some sparks. Re-read before you merge.'],
    }
  return {
    emoji: '💥',
    color: 'error',
    sound: 'sounds/miss.wav',
    lines: ['Ouch. Time for a slow re-read.', 'Zero for now. The diff wins this round.'],
  }
}

const VERDICT = {
  correct: { icon: '✅', color: 'success', word: 'Correct' },
  partial: { icon: '🟡', color: 'warning', word: 'Partly' },
  incorrect: { icon: '❌', color: 'error', word: 'Missed' },
} as const

const CONFETTI = ['✦', '·', '★', '✧', '+', '✶', '*', '·'] as const
const CONFETTI_COLORS = ['claude', 'success', 'warning', 'suggestion', 'merged', 'permission'] as const

const easeOut = (t: number) => 1 - (1 - t) ** 3

const rowsOf = (line: string) => 1 + Math.floor([...line].length / ROW_COLS)

// Keeps the lines that fit the dialog's room, in order, the first always.
const fitRows = (lines: string[], room = DIALOG_ROWS - 1) => {
  const kept: string[] = []
  let used = 0
  for (const line of lines) {
    const rows = rowsOf(line)
    if (kept.length > 0 && used + rows > room) continue
    kept.push(line)
    used += rows
  }
  return kept
}

const fileList = (files: string[]) => {
  const names = [...new Set(files.map(baseName))]
  if (names.length === 0) return undefined
  let line = `On: ${names[0]}`
  let i = 1
  while (i < names.length && [...`${line}, ${names[i]} (+9)`].length < ROW_COLS - 1) {
    line += `, ${names[i]}`
    i += 1
  }
  return i < names.length ? `${line} (+${names.length - i})` : line
}

const HOW = `1. Call AskUserQuestion ONCE with 2-4 questions about the change, and pass metadata: {"source": "${QUIZ_SOURCE}"}. The mod first asks the user whether they want the quiz, then shows answering instructions above your questions. Mix the formats:
   - at least one single-choice question (multiSelect: false),
   - at least one checkbox question (multiSelect: true) where more than one option is correct,
   - the user can always type a free-text answer via "Other"; for one question, make the options deliberately incomplete so explaining in their own words is the best answer.
   Keep each header short and concrete (it is shown in the instructions): "Approach", "Edge case", "Risk".
2. Aim at understanding and judgment, not trivia. Good angles: why this approach over an alternative; what breaks if a specific line/condition is removed; predicting behavior for an edge-case input; trade-offs (performance, readability, coupling, testability); how they would verify it works; what risk or follow-up the change leaves open.
3. Make every distractor plausible. Do NOT mark the correct answer, add "(Recommended)", or hint at it in labels or descriptions. Keep each question self-contained (name the file/function it is about).
4. If the AskUserQuestion call comes back saying the user skipped the quiz, or they dismiss it, accept that and end the turn with one short line. Do not ask again.
5. After the user answers, grade each question and call ${RESULTS_TOOL} ONCE. It draws a playful scorecard (score, percentage, effects) for the user. Per question give:
   - question: a 2-6 word label ("Why the Stop fallback"),
   - verdict: correct | partial | incorrect,
   - user_answer: what they picked or wrote, short; correct_answer: the right answer, short,
   - punchline: ONE punchy line, 12 words max, vivid and specific to their answer. Praise a hit with energy ("Nailed it: the guard stops the double fire."); name a miss plainly ("Close, but reload wipes module vars, not the store."). No generic filler like "Great job!",
   - explanation: 1-2 tight sentences with the why and the misconception, if any,
   - ref: file:line where it lives, when useful.
   Also give next_step: one sentence on what to look at next.
   The scorecard IS the feedback: do not repeat it in your own text. After the tool returns, write at most one short line. If ${RESULTS_TOOL} is not available, give the same feedback as short text instead.
6. Do not edit any files during the quiz. If an answer exposes a real problem in the change, say so and propose a fix, but wait for the user's go-ahead.`

const atStop = (files: string[]) => `[comprehension-check] You changed code this turn. Before ending, quiz the user on it to check their understanding and build critical thinking.

Files changed: ${files.map(f => `\n- ${f}`).join('')}

Do this now:
${HOW}`

const midTurn = `[comprehension-check] The user has enabled comprehension quizzes. You have started changing code in this turn. Keep working on the task as normal; once ALL the code changes for this request are done, and before you end your turn, quiz the user on what you changed:
${HOW}`

const RESULTS_SCHEMA = {
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

const readStats = async ($: EngineInterface): Promise<Stats> => {
  const s = asRecord(await $.store.get(STATS_KEY))
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return { quizzes: n(s?.quizzes), totalPct: n(s?.totalPct), streak: n(s?.streak), best: n(s?.best) }
}

const statsText = (s: { quizzes: number; average: number; streak: number; best: number }) =>
  s.quizzes === 0
    ? 'No quizzes graded yet.'
    : `${s.quizzes} quiz${s.quizzes === 1 ? '' : 'zes'} · average ${s.average}% · best ${s.best}% · streak ${s.streak} (80%+ in a row)`

const versionIn = (json: string): string | undefined => {
  try {
    const v = asRecord(JSON.parse(json))?.version
    return typeof v === 'string' && SEMVER.test(v) ? v : undefined
  } catch {
    return undefined
  }
}

// True when `a` is a later version than `b`. A pre-release sorts below its release.
const isNewer = (a: string, b: string) => {
  const pa = SEMVER.exec(a)
  const pb = SEMVER.exec(b)
  if (pa === null || pb === null) return false
  for (let i = 1; i <= 3; i += 1) {
    const d = Number(pa[i]) - Number(pb[i])
    if (d !== 0) return d > 0
  }
  return !a.includes('-') && b.includes('-')
}

const installedVersion = async ($: EngineInterface) => {
  try {
    const text = await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`)
    return typeof text === 'string' ? versionIn(text) : undefined
  } catch {
    return undefined
  }
}

const latestVersion = async ($: EngineInterface) => {
  try {
    const res = await $.http.fetch(LATEST_URL)
    return res.ok ? versionIn(res.text) : undefined
  } catch {
    return undefined
  }
}

const MANUAL = `Update from a shell instead:\n${UPDATE_STEPS.map(argv => `  ${argv.join(' ')}`).join('\n')}`

const lastLine = (text: string) =>
  text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l !== '')
    .pop()

const versionReport = async ($: EngineInterface) => {
  const [installed, latest] = await Promise.all([installedVersion($), latestVersion($)])
  const have = `${PLUGIN} ${installed === undefined ? '(version unknown)' : `v${installed}`}`
  if (latest === undefined) return `${have}. Could not check for a newer version.`
  if (installed === undefined || isNewer(latest, installed)) {
    return `${have}. v${latest} is available: run /${COMMAND} update.`
  }
  return `${have}, the latest version.`
}

const runUpdate = async ($: EngineInterface) => {
  const [installed, latest] = await Promise.all([installedVersion($), latestVersion($)])
  if (installed !== undefined && latest !== undefined && !isNewer(latest, installed)) {
    return `${PLUGIN} v${installed} is already the latest version.`
  }
  for (const argv of UPDATE_STEPS) {
    const shown = argv.join(' ')
    let ran
    try {
      ran = await $.process.run(argv, { timeoutMs: UPDATE_TIMEOUT_MS })
    } catch {
      return `Could not run \`${shown}\` here. ${MANUAL}`
    }
    if (ran.exitCode !== 0) {
      const why = lastLine(ran.stderr) ?? lastLine(ran.stdout)
      return `\`${shown}\` failed${why === undefined ? '' : `: ${why}`}. ${MANUAL}`
    }
  }
  const from = installed === undefined ? '' : ` from v${installed}`
  const to = latest === undefined ? '' : ` to v${latest}`
  return `Updated ${PLUGIN}${from}${to}. Run /reload-plugins or restart Claude Code to load it.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Comprehension quiz after code changes: on | off | status | stats | sound on|off | version | update',
      argumentHint: 'on|off|status|stats|sound on|off|version|update',
    })
    await $.tool.register({
      name: RESULTS_NAME,
      description:
        'Show the user a scorecard for the comprehension quiz you just graded. Call once, right after the user answers the quiz questions.',
      inputSchema: RESULTS_SCHEMA,
      isDeferred: false,
    })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const [arg = '', sub = ''] = e.args.trim().toLowerCase().split(/\s+/)
    if (arg === 'on' || arg === 'off') {
      await $.store.set(ENABLED_KEY, arg === 'on')
      if (arg === 'off') changed.clear()
      return { text: `Comprehension quiz ${arg === 'on' ? 'enabled' : 'disabled'}.` }
    }
    if (arg === 'sound') {
      if (sub === 'on' || sub === 'off') {
        await $.store.set(SOUND_KEY, sub === 'on')
        return { text: `Quiz sounds ${sub === 'on' ? 'on' : 'off'}.` }
      }
      return { text: `Quiz sounds are ${(await isSoundOn($)) ? 'on' : 'off'}. Use /${COMMAND} sound on|off.` }
    }
    if (arg === 'stats') {
      const s = await readStats($)
      const average = s.quizzes === 0 ? 0 : Math.round(s.totalPct / s.quizzes)
      return { text: `📈 ${statsText({ ...s, average })}` }
    }
    if (arg === 'version') return { text: await versionReport($) }
    if (arg === 'update') {
      $.ui.toast(`Updating ${PLUGIN}…`)
      return { text: await runUpdate($) }
    }
    const isOn = await isEnabled($)
    return {
      text: `Comprehension quiz is ${isOn ? 'on' : 'off'}. Use /${COMMAND} on|off, /${COMMAND} stats, /${COMMAND} sound on|off, /${COMMAND} version, /${COMMAND} update.`,
    }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) isReminded = false
    return next(e)
  })

  // The model calls the scorecard tool; showing it needs no permission.
  on('tool.check', { tool: RESULTS_MATCH }, async () => ({ decision: 'allow' as const }))

  on('tool.call', { tool: RESULTS_MATCH }, async ($, e) => {
    const parsed = parseResults(e)
    if (parsed === undefined) {
      return { deny: 'quiz_results needs a non-empty "results" array with a valid verdict on each item.' }
    }
    const { points, pct } = scoreOf(parsed.results)
    const prev = await readStats($)
    const stats: Stats = {
      quizzes: prev.quizzes + 1,
      totalPct: prev.totalPct + pct,
      streak: pct >= 80 ? prev.streak + 1 : 0,
      best: Math.max(prev.best, pct),
    }
    await $.store.set(STATS_KEY, stats)

    const id = e.tool_use_id ?? ''
    const card: CardStats = {
      quizzes: stats.quizzes,
      average: Math.round(stats.totalPct / stats.quizzes),
      streak: stats.streak,
      best: stats.best,
    }
    await update($, cards, all => Object.fromEntries([...Object.entries(all), [id, card]].slice(-20)))

    // Count the score up, then leave the card still.
    await update($, anim, () => ({ id, frame: 0 }))
    const timer = $.clock.every(FRAME_MS, () => {
      void update($, anim, a => {
        if (a === null || a.id !== id) return a
        if (a.frame + 1 >= FRAMES) {
          timer.cancel()
          return null
        }
        return { id, frame: a.frame + 1 }
      })
    })

    const tier = tierOf(pct)
    $.ui.toast(`${tier.emoji} ${pct}% on the quiz. ${pick(tier.lines, id)}`)
    if (await isSoundOn($)) {
      void $.audio.play({ asset: tier.sound }).catch(() => undefined)
    }

    const n = parsed.results.length
    return {
      result: `Scorecard shown to the user: ${pct}% (${points}/${n}). It already shows every verdict, punchline and explanation, so do not repeat them. Close with at most one short line.`,
    }
  })

  on('tool.call', async ($, e, next) => {
    // The quiz itself: ask first whether the user wants it.
    if (isQuizCall(e) && e.agentId === undefined && (await isEnabled($))) {
      const files = changed.size > 0 ? [...changed] : asked
      const questions = Array.isArray(asRecord(e)?.questions) ? (asRecord(e)?.questions as unknown[]).length : 0
      await update($, gate, () => ({ files, questions }))
      let answer: string | undefined
      try {
        answer = await $.ui.ask(
          `🧠 Quiz time! Ready for ${questions || 'a few'} quick questions on what Claude just changed?`,
          { header: GATE_HEADER, options: [YES, NO] },
        )
      } catch {
        answer = undefined
      }
      await update($, gate, () => null)
      const isYes = answer !== undefined && (answer === YES || /^\s*(y|yes|sure|ok|okay|go)\b/i.test(answer))
      if (!isYes) {
        changed.clear()
        asked = []
        return {
          deny: `The user chose to skip the comprehension quiz. Do not ask again and do not call ${RESULTS_TOOL}; end your turn with one short line.`,
        }
      }
    }

    const ran = await next(e)
    const isOk = ran.deny === undefined && ran.isError !== true
    if (!isOk) return ran

    if (e.tool === QUIZ_TOOL && e.agentId === undefined) {
      // The quiz happened: nothing is owed until the next edit.
      changed.clear()
      asked = []
      return ran
    }

    if (EDIT_TOOLS.has(e.tool)) {
      const p = pathOf(e)
      if (p !== undefined) changed.add(p)
      if (!isReminded && (await isEnabled($))) {
        isReminded = true
        // Reaches the model at the loop's next step, even where a policy
        // plugin above passes over this mod's Stop hook.
        await $.session.append({
          message: { type: 'user', content: [{ type: 'text', text: midTurn }] },
        })
      }
    }
    return ran
  })

  on('classic.Stop', async ($, e, next) => {
    const result = await next(e)
    // Someone else is already sending Claude back, or this is the stop after
    // our own push: let it end.
    if (result.block !== undefined || e.stop_hook_active) return result
    if (changed.size === 0) return result
    const files = [...changed]
    changed.clear()
    if (!(await isEnabled($))) return result
    asked = files
    return { ...result, block: atStop(files) }
  })

  // Banners above the two dialogs: the yes/no gate and the quiz itself.
  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const questions = (Array.isArray(e.props.questions) ? e.props.questions : []) as Question[]
    const isGate = questions.length === 1 && questions[0]?.header === GATE_HEADER
    const isQuiz = e.props.metadataSource === QUIZ_SOURCE
    if (!isGate && !isQuiz) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const engine = await next(e)

    if (isGate) {
      const info = await read($, gate)
      const count = info?.questions ?? 0
      const files = fileList(info?.files ?? [])
      const lines = fitRows([
        '🧠 COMPREHENSION CHECK',
        `${count > 0 ? `${count} questions` : 'A few questions'} · about a minute`,
        ...(files === undefined ? [] : [files]),
        'No hints. No penalty. You vs the diff.',
      ])
      return (
        <Box flexDirection="column">
          {lines.map((line, i) =>
            i === 0 ? (
              <Text bold color="claude">
                {line}
              </Text>
            ) : (
              <Text dimColor>{line}</Text>
            ),
          )}
          {engine}
        </Box>
      )
    }

    const howTo = questions.map((q, i) => {
      const header = q.header ?? `Question ${i + 1}`
      return q.multiSelect === true
        ? `☑ Q${i + 1} ${header}: pick ALL that apply`
        : `◉ Q${i + 1} ${header}: pick one`
    })
    const lines = fitRows([
      `🧠 COMPREHENSION CHECK · ${questions.length} questions`,
      ...howTo,
      '✎ Other: answer in your own words',
      'No answer is marked. Esc skips.',
    ])
    return (
      <Box flexDirection="column">
        {lines.map((line, i) =>
          i === 0 ? (
            <Text bold color="claude">
              {line}
            </Text>
          ) : (
            <Text dimColor={i > howTo.length}>{line}</Text>
          ),
        )}
        {engine}
      </Box>
    )
  })

  // Under the scorecard: a hint, not the text the model read.
  on('ui.render', { component: 'ToolResult', props: { tool: RESULTS_TOOL } }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>  ⎿ /{COMMAND} stats for your record</Text>
  })

  // The scorecard, drawn in place of the tool's own row.
  on('ui.render', { component: 'ToolUse', props: { tool: RESULTS_TOOL } }, async ($, e, next) => {
    const parsed = parseResults(e.props.input)
    if (parsed === undefined) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    const id = e.props.tool_use_id
    const { points, pct } = scoreOf(parsed.results)
    const tier = tierOf(pct)
    const a = await read($, anim)
    const progress = a !== null && a.id === id ? easeOut(Math.min(1, a.frame / FRAMES)) : 1
    const frame = a !== null && a.id === id ? a.frame : 0
    const shown = Math.round(pct * progress)

    const cols = e.viewport?.columns ?? 80
    const barWidth = Math.max(10, Math.min(24, cols - 40))
    const filled = Math.round((barWidth * shown) / 100)
    const stats = (await read($, cards))[id]
    const n = parsed.results.length

    const confettiWidth = Math.max(8, Math.min(28, cols - 8))
    const confetti =
      pct >= 80
        ? Array.from({ length: confettiWidth }, (_, i) => ({
            ch: CONFETTI[(i * 3 + frame) % CONFETTI.length] as string,
            color: CONFETTI_COLORS[(i + frame) % CONFETTI_COLORS.length] as string,
          }))
        : []

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={tier.color} paddingX={1}>
        {confetti.length > 0 && (
          <Text>
            {confetti.map(c => (
              <Text color={c.color}>{c.ch}</Text>
            ))}
          </Text>
        )}
        <Text>
          <Text bold>
            {tier.emoji} {String(shown).padStart(3)}%{' '}
          </Text>
          <Text color={tier.color}>{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(barWidth - filled)}</Text>
          <Text dimColor>
            {' '}
            {points}/{n}
          </Text>
        </Text>
        <Text bold color={tier.color}>
          {pick(tier.lines, id)}
        </Text>
        {parsed.results.map((r, i) => {
          const v = VERDICT[r.verdict]
          const showAnswer = r.verdict !== 'correct' && r.correct_answer !== undefined
          return (
            <Box flexDirection="column" marginTop={1}>
              <Text>
                {v.icon}{' '}
                <Text bold>
                  Q{i + 1} · {r.question}
                </Text>{' '}
                <Text color={v.color}>{v.word}</Text>
              </Text>
              {r.punchline !== '' && (
                <Text bold color={v.color}>
                  {'   '}
                  {r.punchline}
                </Text>
              )}
              {(r.user_answer !== undefined || showAnswer) && (
                <Text dimColor>
                  {'   '}
                  {r.user_answer !== undefined ? `You said: ${r.user_answer}` : ''}
                  {r.user_answer !== undefined && showAnswer ? '  ·  ' : ''}
                  {showAnswer ? `Answer: ${r.correct_answer}` : ''}
                </Text>
              )}
              {r.explanation !== '' && <Text>   {r.explanation}</Text>}
              {r.ref !== undefined && <Text dimColor>   ↳ {r.ref}</Text>}
            </Box>
          )
        })}
        {parsed.next_step !== undefined && (
          <Box marginTop={1}>
            <Text>
              <Text bold color="claude">
                ➜ Next:
              </Text>{' '}
              {parsed.next_step}
            </Text>
          </Box>
        )}
        {stats !== undefined && (
          <Text dimColor>
            📈 {statsText(stats)}
          </Text>
        )}
      </Box>
    )
  })
}

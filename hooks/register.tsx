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
const MAX_KEY = 'maxQuestions'
const SIZING_KEY = 'sizing'

// How many questions a quiz may have. AskUserQuestion takes at most 4, and
// mixing a single-choice with a checkbox question needs at least 2.
const MIN_QUESTIONS = 2
const MAX_QUESTIONS = 4
// `agent`: Claude picks 2..max for the change. `size`: the mod sets the count
// from the files touched and the lines changed.
type Sizing = 'agent' | 'size'
// Size thresholds: reaching either the files or the lines of a step adds a question.
const SIZE_STEPS = [
  { files: 3, lines: 80 },
  { files: 6, lines: 250 },
] as const

// Files that never count as a change worth a quiz: dependency lock files,
// and (checked through git) files the repo ignores.
const LOCK_FILE =
  /^(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|Gemfile\.lock|composer\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|go\.sum|flake\.lock|Podfile\.lock|pubspec\.lock|mix\.lock|packages\.lock\.json)$|\.lock$/

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

// Files changed since the last quiz (each with the lines changed in it), the
// files the Stop hook asked about, whether this turn already got the mid-turn
// reminder, and the question count Claude was last told (size mode). Module
// variables start over on a reload, which at worst skips one quiz.
type Changes = Map<string, number>
const changed: Changes = new Map()
let asked: Changes = new Map()
let isReminded = false
let announced = 0
// Whether git ignores a path, asked once per path.
const ignoredCache = new Map<string, boolean>()

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

const clampQuestions = (n: number) => Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, Math.round(n)))

type Settings = { sound: boolean; max: number; sizing: Sizing }
const readSettings = async ($: EngineInterface): Promise<Settings> => {
  const max = await $.store.get(MAX_KEY)
  return {
    sound: await isSoundOn($),
    max: typeof max === 'number' && Number.isFinite(max) ? clampQuestions(max) : MAX_QUESTIONS,
    sizing: (await $.store.get(SIZING_KEY)) === 'size' ? 'size' : 'agent',
  }
}

const SIZING_WORDS: Record<Sizing, string> = { agent: 'Claude decides', size: 'by change size' }

const settingsText = (s: Settings) =>
  `Quiz settings: sound ${s.sound ? 'on' : 'off'} · at most ${s.max} questions · count ${SIZING_WORDS[s.sizing]}.`

const SETTINGS_USAGE = `Change one with /quiz settings sound on|off, /quiz settings questions 2|3|4, /quiz settings count agent|size.`

const linesIn = (s: unknown) => (typeof s === 'string' && s !== '' ? s.split('\n').length : 0)

// Lines an edit changed, as a diff counts them: removed plus added.
const linesOf = (input: unknown) => {
  const rec = asRecord(input)
  if (rec === undefined) return 0
  if (rec.tool === 'Edit') return linesIn(rec.old_string) + linesIn(rec.new_string)
  if (rec.tool === 'Write') return linesIn(rec.content)
  if (rec.tool === 'NotebookEdit') return linesIn(rec.new_source)
  return 0
}

const totalLines = (c: Changes) => [...c.values()].reduce((sum, n) => sum + n, 0)

// The question count in size mode: 2, plus one for each size step reached,
// never above the user's max.
const sizedCount = (c: Changes, max: number) => {
  const files = c.size
  const lines = totalLines(c)
  const steps = SIZE_STEPS.filter(s => files >= s.files || lines >= s.lines).length
  return Math.min(max, MIN_QUESTIONS + steps)
}

const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/'

// A lock file, or a file the repo's .gitignore covers. Outside a repo, or
// where git cannot run, nothing counts as ignored.
const isIgnored = async ($: EngineInterface, p: string) => {
  if (LOCK_FILE.test(baseName(p))) return true
  const known = ignoredCache.get(p)
  if (known !== undefined) return known
  let ignored = false
  try {
    const ran = await $.process.run(['git', 'check-ignore', '-q', '--', p], { cwd: dirOf(p), timeoutMs: 5_000 })
    ignored = ran.exitCode === 0
  } catch {
    ignored = false
  }
  ignoredCache.set(p, ignored)
  return ignored
}

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

// How many questions to ask, as Claude is told it.
type Count = { sizing: 'agent'; max: number } | { sizing: 'size'; count: number; files: number; lines: number }

const countFor = (s: Settings, c: Changes): Count =>
  s.sizing === 'size'
    ? { sizing: 'size', count: sizedCount(c, s.max), files: c.size, lines: totalLines(c) }
    : { sizing: 'agent', max: s.max }

const countText = (c: Count) =>
  c.sizing === 'size'
    ? `exactly ${c.count} questions (set by the size of the change: ${c.files} file${c.files === 1 ? '' : 's'}, about ${c.lines} lines changed)`
    : c.max === MIN_QUESTIONS
      ? `${MIN_QUESTIONS} questions`
      : `${MIN_QUESTIONS}-${c.max} questions (fewer for a small, focused change; more for a large or risky one)`

const how = (c: Count) => `1. Call AskUserQuestion ONCE with ${countText(c)} about the change, and pass metadata: {"source": "${QUIZ_SOURCE}"}. The mod first asks the user whether they want the quiz, then shows answering instructions above your questions. Mix the formats:
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

const atStop = (files: string[], c: Count) => `[comprehension-check] You changed code this turn. Before ending, quiz the user on it to check their understanding and build critical thinking.

Files changed: ${files.map(f => `\n- ${f}`).join('')}

Do this now:
${how(c)}`

const midTurn = (c: Count) => `[comprehension-check] The user has enabled comprehension quizzes. You have started changing code in this turn. Keep working on the task as normal; once ALL the code changes for this request are done, and before you end your turn, quiz the user on what you changed:
${how(c)}${c.sizing === 'size' ? '\nIf the change grows, a later [comprehension-check] note raises the count; use the latest one.' : ''}`

const grown = (c: Extract<Count, { sizing: 'size' }>) =>
  `[comprehension-check] The change has grown to ${c.files} files and about ${c.lines} changed lines: ask exactly ${c.count} questions in the quiz.`

// Refuses a quiz whose length breaks the settings, before the user is asked.
const badLength = (n: number, c: Count) => {
  if (c.sizing === 'size' && n !== c.count) {
    return `The user's quiz settings ask for exactly ${c.count} questions for this change, and this call has ${n}. Call AskUserQuestion again with exactly ${c.count} questions.`
  }
  if (c.sizing === 'agent' && n > c.max) {
    return `The user's quiz settings allow at most ${c.max} questions, and this call has ${n}. Call AskUserQuestion again with ${MIN_QUESTIONS}-${c.max} questions.`
  }
  return undefined
}

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

// One setting from words: `sound on`, `questions 3`, `count size`.
const applySetting = async ($: EngineInterface, key: string, value: string): Promise<string | undefined> => {
  if (key === 'sound' && (value === 'on' || value === 'off')) {
    await $.store.set(SOUND_KEY, value === 'on')
    return `Quiz sounds ${value}.`
  }
  if (key === 'questions' || key === 'max') {
    const n = Number(value)
    if (!Number.isInteger(n) || n < MIN_QUESTIONS || n > MAX_QUESTIONS) return undefined
    await $.store.set(MAX_KEY, n)
    return `Quizzes now have at most ${n} questions.`
  }
  if (key === 'count' && (value === 'agent' || value === 'size')) {
    await $.store.set(SIZING_KEY, value)
    return value === 'size'
      ? 'The question count now follows the size of the change (lock and git-ignored files do not count).'
      : 'Claude now decides the question count, up to your max.'
  }
  return undefined
}

const SIZING_LABEL: Record<Sizing, string> = { agent: 'Claude decides', size: 'By change size' }
const DONE = 'Done'
// Rounds of the settings menu before it closes by itself.
const MENU_ROUNDS = 6

// True while the settings menu is open, so its questions never count as a quiz.
let isInSettings = false

// The settings menu: pick a setting, pick its value, back to the menu until Done.
const settingsDialog = async ($: EngineInterface): Promise<string> => {
  const ask = async (question: string, header: string, options: string[]) => {
    try {
      return await $.ui.ask(question, { header, options })
    } catch {
      return undefined
    }
  }
  let changes = 0
  isInSettings = true
  try {
    for (let round = 0; round < MENU_ROUNDS; round += 1) {
      const s = await readSettings($)
      const items = {
        sound: `Sound: ${s.sound ? 'on' : 'off'}`,
        max: `Max questions: ${s.max}`,
        sizing: `Count: ${SIZING_LABEL[s.sizing]}`,
      }
      const picked = await ask('Which quiz setting do you want to change?', 'Settings', [
        items.sound,
        items.max,
        items.sizing,
        DONE,
      ])
      if (picked === undefined || picked === DONE) break
      if (picked === items.sound) {
        const v = await ask('Play a sound with the quiz scorecard?', 'Sound', ['On', 'Off'])
        if (v === 'On' || v === 'Off') changes += (await applySetting($, 'sound', v.toLowerCase())) ? 1 : 0
      } else if (picked === items.max) {
        const v = await ask('At most how many questions should a quiz have?', 'Questions', ['2', '3', '4'])
        if (v !== undefined) changes += (await applySetting($, 'questions', v.trim())) ? 1 : 0
      } else if (picked === items.sizing) {
        const v = await ask(
          'Who decides how many questions a quiz has? By change size counts files touched and lines changed, without lock or git-ignored files.',
          'Count',
          [SIZING_LABEL.agent, SIZING_LABEL.size],
        )
        if (v === SIZING_LABEL.agent || v === SIZING_LABEL.size) {
          changes += (await applySetting($, 'count', v === SIZING_LABEL.size ? 'size' : 'agent')) ? 1 : 0
        }
      }
    }
  } finally {
    isInSettings = false
  }
  const now = settingsText(await readSettings($))
  return changes === 0 ? `No changes. ${now} ${SETTINGS_USAGE}` : `Saved. ${now}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Comprehension quiz after code changes: on | off | status | stats | settings | version | update',
      argumentHint: 'on|off|status|stats|settings|version|update',
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
    const [arg = '', sub = '', value = ''] = e.args.trim().toLowerCase().split(/\s+/)
    if (arg === 'on' || arg === 'off') {
      await $.store.set(ENABLED_KEY, arg === 'on')
      if (arg === 'off') changed.clear()
      return { text: `Comprehension quiz ${arg === 'on' ? 'enabled' : 'disabled'}.` }
    }
    if (arg === 'settings') {
      if (sub === '') return { text: await settingsDialog($) }
      const done = await applySetting($, sub, value)
      return { text: done ?? `Unknown setting: ${`${sub} ${value}`.trim()}. ${SETTINGS_USAGE}` }
    }
    // Kept from before settings existed.
    if (arg === 'sound') {
      const done = await applySetting($, 'sound', sub)
      if (done !== undefined) return { text: done }
      return { text: `Quiz sounds are ${(await isSoundOn($)) ? 'on' : 'off'}. Use /${COMMAND} settings sound on|off.` }
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
      text: `Comprehension quiz is ${isOn ? 'on' : 'off'}. Use /${COMMAND} on|off, /${COMMAND} stats, /${COMMAND} settings, /${COMMAND} version, /${COMMAND} update.`,
    }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      isReminded = false
      announced = 0
    }
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
      const owed = changed.size > 0 ? changed : asked
      const questions = Array.isArray(asRecord(e)?.questions) ? (asRecord(e)?.questions as unknown[]).length : 0
      // A quiz of the wrong length goes back to Claude before the user sees it.
      const wrong = badLength(questions, countFor(await readSettings($), owed))
      if (wrong !== undefined) return { deny: wrong }
      const files = [...owed.keys()]
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
        asked = new Map()
        return {
          deny: `The user chose to skip the comprehension quiz. Do not ask again and do not call ${RESULTS_TOOL}; end your turn with one short line.`,
        }
      }
    }

    const ran = await next(e)
    const isOk = ran.deny === undefined && ran.isError !== true
    if (!isOk) return ran

    if (e.tool === QUIZ_TOOL && e.agentId === undefined && !isInSettings) {
      // The quiz happened: nothing is owed until the next edit.
      changed.clear()
      asked = new Map()
      return ran
    }

    if (EDIT_TOOLS.has(e.tool)) {
      const p = pathOf(e)
      // Lock files and git-ignored files are never quizzed on.
      if (p === undefined || (await isIgnored($, p))) return ran
      changed.set(p, (changed.get(p) ?? 0) + linesOf(e))
      if (!(await isEnabled($))) return ran
      const count = countFor(await readSettings($), changed)
      // Reaches the model at the loop's next step, even where a policy
      // plugin above passes over this mod's Stop hook.
      const note = (text: string) => $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } })
      if (!isReminded) {
        isReminded = true
        if (count.sizing === 'size') announced = count.count
        await note(midTurn(count))
      } else if (count.sizing === 'size' && count.count > announced) {
        announced = count.count
        await note(grown(count))
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
    const owed = new Map(changed)
    changed.clear()
    if (!(await isEnabled($))) return result
    asked = owed
    return { ...result, block: atStop([...owed.keys()], countFor(await readSettings($), owed)) }
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

// Every tunable of the mod in one place: names, limits, thresholds, timings
// and the data the scorecard draws from. The rest of the code reads these
// values and hard-codes none of them.

// ─── Identity ────────────────────────────────────────────────────────────────

export const PLUGIN_NAME = 'comprehension-check'
export const COMMAND_NAME = 'quiz'

// The engine's question dialog, which carries the quiz.
export const QUIZ_TOOL = 'AskUserQuestion'
// The quiz call carries this as `metadata.source`, so the mod can tell it from
// any other question Claude asks.
export const QUIZ_SOURCE = PLUGIN_NAME
// Tools whose successful call means "code changed".
export const EDIT_TOOLS: ReadonlySet<string> = new Set(['Edit', 'Write', 'NotebookEdit'])

// The scorecard tool the mod registers, and the name the model calls it by.
export const RESULTS_TOOL_NAME = 'quiz_results'
export const RESULTS_TOOL = `mcp__${PLUGIN_NAME}__${RESULTS_TOOL_NAME}`

// Keys in the mod's persistent store.
export const STORE_KEYS = {
  enabled: 'enabled',
  sound: 'sound',
  maxQuestions: 'maxQuestions',
  sizing: 'sizing',
  perspective: 'perspective',
  wording: 'wording',
  stats: 'stats',
} as const

// ─── Quiz size ───────────────────────────────────────────────────────────────

// The max questions a user can set, and the most one dialog holds: a longer
// quiz is asked in rounds of up to `perDialog`.
export const QUESTION_LIMITS = { min: 1, max: 99, perDialog: 4 } as const

// `agent`: Claude weighs the change and picks how many, up to the max.
// `size`: one question per LINES_PER_QUESTION changed lines, up to the max.
export type Sizing = 'agent' | 'size'

export const LINES_PER_QUESTION = 100

// ─── Quiz perspective ────────────────────────────────────────────────────────

// The angle the questions take. `mixed` draws on the other three, picking the
// angles the change actually carries. What each one asks is in quiz/prompts.ts.
export const PERSPECTIVES = ['mixed', 'code', 'architecture', 'product'] as const
export type Perspective = (typeof PERSPECTIVES)[number]

// ─── Quiz wording ────────────────────────────────────────────────────────────

// How the quiz is written. `plain`: short sentences and everyday words, so the
// user's time goes into the answer, not into reading the question. `standard`:
// precise technical wording, as dense as the change calls for. The rules for
// each are in quiz/prompts.ts.
export const WORDINGS = ['plain', 'standard'] as const
export type Wording = (typeof WORDINGS)[number]

export const DEFAULT_SETTINGS = {
  sound: true,
  maxQuestions: QUESTION_LIMITS.perDialog as number,
  sizing: 'agent' as Sizing,
  perspective: 'mixed' as Perspective,
  wording: 'plain' as Wording,
} as const

// ─── Files that never count as a change ──────────────────────────────────────

export const IGNORED_FILES = {
  // Dependency lock files, matched by file name.
  lockFileNames: [
    'package-lock.json',
    'npm-shrinkwrap.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lock',
    'bun.lockb',
    'Cargo.lock',
    'Gemfile.lock',
    'composer.lock',
    'poetry.lock',
    'uv.lock',
    'Pipfile.lock',
    'go.sum',
    'flake.lock',
    'Podfile.lock',
    'pubspec.lock',
    'mix.lock',
    'packages.lock.json',
  ],
  // Any file ending in one of these is a lock file too.
  lockFileSuffixes: ['.lock'],
  // How long `git check-ignore` may take for one file.
  gitCheckTimeoutMs: 5_000,
} as const

// ─── On-demand quizzes ───────────────────────────────────────────────────────

// `/quiz last [n]`, `/quiz uncommitted`, `/quiz codebase`: a quiz on code read
// from git rather than on the edits of a turn.
export const ON_DEMAND = {
  // The most commits `/quiz last <n>` takes.
  maxCommits: 100,
  // Files named to Claude, largest first; the rest are counted.
  listedFiles: 30,
  // Untracked files whose lines are counted (one git call each); past this
  // many they are still listed, at 0 lines.
  countedUntracked: 200,
  // How long one git command may take.
  gitTimeoutMs: 15_000,
  // The wait after `/quiz last` returns before its prompt is submitted: the
  // engine refuses one while the command is still running.
  submitDelayMs: 0,
} as const

// ─── Dialogs ─────────────────────────────────────────────────────────────────

// The yes/no question asked before the quiz.
export const GATE = {
  header: 'Quiz time',
  yes: 'Yes, quiz me',
  no: 'Not now',
  // Free text typed under "Other" that also counts as a yes.
  yesWords: /^\s*(y|yes|sure|ok|okay|go)\b/i,
} as const

// The settings menu opened by `/quiz settings`. A dialog holds at most
// QUESTION_LIMITS.perDialog options, so with more settings than that the menu
// comes in pages: the settings, then a row to the next page (or back to the
// first from the last). Esc closes it.
export const SETTINGS_MENU = {
  header: 'Settings',
  moreRow: 'More settings…',
  backRow: 'Back',
  // Marks the current value among the max-questions options.
  currentMark: ' (current)',
  // The max questions offered; any number from 1 to 99 can be typed.
  maxPresets: [2, 4, 6, 8],
  // Rounds of the menu before it closes by itself.
  maxRounds: 12,
} as const

// The menu plain `/quiz` opens: the subcommands, each with what it does, in
// pages of a dialog's 4 options. Text typed under Other runs as a subcommand.
export const COMMAND_MENU = {
  header: 'Quiz',
  moreRow: 'More commands…',
  backRow: 'Back',
  // The commit counts offered after "last"; any other can be typed.
  commitCounts: [1, 3, 5, 10],
  // Rounds of the menu (page turns) before it closes by itself.
  maxRounds: 12,
} as const

// How each part of the banners above the gate and quiz dialogs is drawn, by
// its role (ui/bannerLines.ts). Theme colors, so they suit light and dark.
// Single choice and checkboxes get different colors so the format reads at a
// glance; "pick ALL" is the one thing that must not be missed.
export const BANNER_TONES = {
  title: { color: 'claude', bold: true },
  strong: { bold: true },
  single: { color: 'suggestion' },
  multi: { color: 'merged' },
  alert: { color: 'warning', bold: true },
  other: { color: 'success' },
  accent: { color: 'claude', italic: true },
  plain: {},
  muted: { dimColor: true },
} as const

// Rows the terminal leaves the banner above a question dialog, and the width
// it counts one row at.
export const DIALOG_LAYOUT = { rows: 12, rowColumns: 40 } as const

// ─── Scorecard ───────────────────────────────────────────────────────────────

export const SCORECARD = {
  // The count-up animation: `frames` steps of `frameMs`.
  frames: 18,
  frameMs: 70,
  // Scorecards whose stats are kept for redraws.
  keptCards: 20,
  // A score at or above this extends the streak and throws confetti.
  greatPct: 80,
  // The score bar's width: the terminal width less `reserved`, within min..max.
  bar: { min: 10, max: 24, reserved: 40 },
  confetti: { min: 8, max: 28, reserved: 8 },
  // Recent scores kept for the trend line.
  trend: 10,
  // The body of each question, indented under its title so wrapped lines line up.
  indent: 3,
} as const

export type Verdict = 'correct' | 'partial' | 'incorrect'

// `mark`: the verdict on the "You" line; `cell`: its share of the score bar.
export const VERDICTS: Record<
  Verdict,
  { points: number; icon: string; color: string; word: string; mark: string; cell: string }
> = {
  correct: { points: 1, icon: '✅', color: 'success', word: 'Correct', mark: '✓', cell: '█' },
  partial: { points: 0.5, icon: '🟡', color: 'warning', word: 'Partly', mark: '◐', cell: '▓' },
  incorrect: { points: 0, icon: '❌', color: 'error', word: 'Missed', mark: '✗', cell: '░' },
}

// The trend line's glyphs, lowest score first.
export const SPARK_GLYPHS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const

export type ScoreTier = { minPct: number; emoji: string; color: string; sound: string; lines: readonly string[] }

// Highest first: a score gets the first tier whose `minPct` it reaches.
export const SCORE_TIERS: readonly ScoreTier[] = [
  {
    minPct: 100,
    emoji: '🏆',
    color: 'success',
    sound: 'sounds/fanfare.wav',
    lines: [
      'Flawless. You could have written this diff.',
      'Perfect score. The code fears you.',
      'Clean sweep. Ship it with confidence.',
    ],
  },
  {
    minPct: 80,
    emoji: '🔥',
    color: 'success',
    sound: 'sounds/win.wav',
    lines: ['Sharp! Barely a scratch.', 'Strong read. One nitpick from perfect.', 'You get it. Mostly.'],
  },
  {
    minPct: 50,
    emoji: '💪',
    color: 'warning',
    sound: 'sounds/win.wav',
    lines: [
      'Solid. A couple of blind spots to patch.',
      'Half the battle won. Read the misses.',
      'Decent. The diff still has a secret or two.',
    ],
  },
  {
    minPct: 1,
    emoji: '🌱',
    color: 'warning',
    sound: 'sounds/miss.wav',
    lines: ['Getting there. Worth a second pass.', 'Some sparks. Re-read before you merge.'],
  },
  {
    minPct: 0,
    emoji: '💥',
    color: 'error',
    sound: 'sounds/miss.wav',
    lines: ['Ouch. Time for a slow re-read.', 'Zero for now. The diff wins this round.'],
  },
]

export const CONFETTI = {
  glyphs: ['✦', '·', '★', '✧', '+', '✶', '*', '·'],
  colors: ['claude', 'success', 'warning', 'suggestion', 'merged', 'permission'],
} as const

// ─── Self-update ─────────────────────────────────────────────────────────────

const REPO = 'Manuelstv/comprehension-check'

export const SELF_UPDATE = {
  // The marketplace serves main, so main's manifest is the latest version.
  latestManifestUrl: `https://raw.githubusercontent.com/${REPO}/main/.claude-plugin/plugin.json`,
  // The installed copy's manifest, relative to the plugin root.
  manifestPath: '.claude-plugin/plugin.json',
  // Run in order; `-y` is left out on purpose, so a changed install command
  // declared by the marketplace is never accepted without a person.
  commands: [
    ['claude', 'plugin', 'marketplace', 'update', PLUGIN_NAME],
    ['claude', 'plugin', 'update', `${PLUGIN_NAME}@${PLUGIN_NAME}`],
  ],
  timeoutMs: 120_000,
} as const

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
  stats: 'stats',
} as const

// ─── Quiz size ───────────────────────────────────────────────────────────────

// AskUserQuestion takes at most 4 questions, and mixing a single-choice with a
// checkbox question needs at least 2.
export const QUESTION_LIMITS = { min: 2, max: 4 } as const

// `agent`: Claude picks min..max for the change. `size`: the mod sets the count
// from the files touched and the lines changed.
export type Sizing = 'agent' | 'size'

export const DEFAULT_SETTINGS = {
  sound: true,
  maxQuestions: QUESTION_LIMITS.max,
  sizing: 'agent' as Sizing,
} as const

// In size mode a quiz starts at QUESTION_LIMITS.min questions and gets one more
// for each step it reaches: the files OR the lines of the step.
export const SIZE_STEPS: readonly { files: number; lines: number }[] = [
  { files: 3, lines: 80 },
  { files: 6, lines: 250 },
]

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

// ─── Dialogs ─────────────────────────────────────────────────────────────────

// The yes/no question asked before the quiz.
export const GATE = {
  header: 'Quiz time',
  yes: 'Yes, quiz me',
  no: 'Not now',
  // Free text typed under "Other" that also counts as a yes.
  yesWords: /^\s*(y|yes|sure|ok|okay|go)\b/i,
} as const

export const SETTINGS_MENU = {
  header: 'Settings',
  done: 'Done',
  // Rounds of the menu before it closes by itself.
  maxRounds: 6,
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
} as const

export type Verdict = 'correct' | 'partial' | 'incorrect'

export const VERDICTS: Record<Verdict, { points: number; icon: string; color: string; word: string }> = {
  correct: { points: 1, icon: '✅', color: 'success', word: 'Correct' },
  partial: { points: 0.5, icon: '🟡', color: 'warning', word: 'Partly' },
  incorrect: { points: 0, icon: '❌', color: 'error', word: 'Missed' },
}

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

const REPO = 'agharsallah/comprehension-check'

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

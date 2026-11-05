// What the gate dialog's banner shows while it is open.
export type Gate = { files: string[]; questions: number }

// The scorecard animation in progress: which card, which frame.
export type Anim = { id: string; frame: number }

// Lifetime stats as they stood when a scorecard was drawn.
export type CardStats = { streak: number; average: number; quizzes: number; best: number }

declare module 'claude-code' {
  interface PluginState {
    'comprehension-check': {
      gate: Gate | null
      anim: Anim | null
      cards: Shaped<Record<string, CardStats>>
    }
  }
}

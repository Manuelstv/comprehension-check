// A quiz the user asked for with `/quiz last`, `/quiz uncommitted` or
// `/quiz codebase`. The quiz call in its turn skips the yes/no gate (the user
// just asked) but keeps the length checks, sized on the requested changes
// rather than the turn's edits.
//
// Its life, one step per event:
//   queued     the command ran; its prompt waits, since the engine refuses a
//              prompt submitted while the command's hook is running
//   submitted  the hook returned and the prompt went in
//   running    the turn that prompt started, in which Claude asks the quiz
// Any turn after that one drops it, so it never bends an unrelated quiz.

import type { Changes } from '../changes/changeTracker'

type Phase = 'queued' | 'submitted' | 'running'

export class QuizRequest {
  private state: { changes: Changes; prompt: string; phase: Phase } | undefined

  open(changes: Changes, prompt: string): void {
    this.state = { changes, prompt, phase: 'queued' }
  }

  // The prompt to submit now that the command has returned, once.
  takePrompt(): string | undefined {
    if (this.state?.phase !== 'queued') return undefined
    this.state.phase = 'submitted'
    return this.state.prompt
  }

  // A main-loop turn started: the requested quiz's own turn, or a later one
  // that drops it. A queued request waits for its prompt to go in.
  startTurn(): void {
    if (this.state === undefined || this.state.phase === 'queued') return
    if (this.state.phase === 'submitted') this.state.phase = 'running'
    else this.state = undefined
  }

  // The changes the requested quiz is about, while it is open.
  get requested(): Changes | undefined {
    return this.state?.changes
  }

  // Asked, dismissed, or its prompt never went in.
  close(): void {
    this.state = undefined
  }
}

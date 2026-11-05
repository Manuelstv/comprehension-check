// The files changed since the last quiz, each with the lines changed in it.
//
// Two sets: `pending` grows with every edit; when the Stop hook sends Claude
// back to quiz, it hands them over as `handedToStop`, so the quiz that follows
// still knows its files. A quiz (taken or skipped) forgets both. Kept in
// memory: a reload of the mod starts over, which at worst skips one quiz.

export type Changes = ReadonlyMap<string, number>

export const totalLines = (changes: Changes): number => [...changes.values()].reduce((sum, n) => sum + n, 0)

export class ChangeTracker {
  private pending = new Map<string, number>()
  private handedToStop: Changes = new Map()

  record(path: string, lines: number): void {
    this.pending.set(path, (this.pending.get(path) ?? 0) + lines)
  }

  hasPending(): boolean {
    return this.pending.size > 0
  }

  // The changes made since the last quiz.
  get current(): Changes {
    return this.pending
  }

  // What a quiz now is about: the pending changes, or the ones the Stop hook
  // handed over.
  get owed(): Changes {
    return this.pending.size > 0 ? this.pending : this.handedToStop
  }

  // Empties `pending` and returns what it held.
  takePending(): Changes {
    const taken = new Map(this.pending)
    this.pending.clear()
    return taken
  }

  handToStop(changes: Changes): void {
    this.handedToStop = changes
  }

  // Nothing is owed until the next edit.
  forget(): void {
    this.pending.clear()
    this.handedToStop = new Map()
  }
}

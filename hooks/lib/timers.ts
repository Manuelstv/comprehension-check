// Timers. The mod's type library leaves them out; the runtime has them.

const { setTimeout: later } = globalThis as unknown as {
  setTimeout: (run: () => void, ms: number) => unknown
}

// Resolves after `ms`, on a later task: after the hook that called it returned.
export const delay = (ms = 0): Promise<void> => new Promise(resolve => later(resolve, ms))

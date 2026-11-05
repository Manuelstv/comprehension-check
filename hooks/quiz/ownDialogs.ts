// Questions the mod asks the user itself (the settings menu) go through the
// same AskUserQuestion tool as the quiz. While one is open, the quiz flow must
// not mistake it for a quiz having happened.

export type OwnDialogs = {
  isOpen: () => boolean
  during: <T>(ask: () => Promise<T>) => Promise<T>
}

export const createOwnDialogs = (): OwnDialogs => {
  let open = 0
  return {
    isOpen: () => open > 0,
    during: async ask => {
      open += 1
      try {
        return await ask()
      } finally {
        open -= 1
      }
    },
  }
}

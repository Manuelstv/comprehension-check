// What Claude has been told about the quiz this turn, so each note is sent
// once: the first-edit reminder, then (size mode) a note each time the change
// grows into a larger quiz.

import type { QuestionCount } from './questionCount'

export type NoteToSend = 'first-edit' | 'change-grew' | undefined

export class TurnReminders {
  private hasReminded = false
  private announcedCount = 0

  startTurn(): void {
    this.hasReminded = false
    this.announcedCount = 0
  }

  // The note a new edit calls for, if any; records it as sent.
  noteFor(count: QuestionCount): NoteToSend {
    if (!this.hasReminded) {
      this.hasReminded = true
      if (count.mode === 'size') this.announcedCount = count.exact
      return 'first-edit'
    }
    if (count.mode === 'size' && count.exact > this.announcedCount) {
      this.announcedCount = count.exact
      return 'change-grew'
    }
    return undefined
  }
}

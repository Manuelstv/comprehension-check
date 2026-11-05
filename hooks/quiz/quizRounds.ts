// The quiz in progress, for a quiz asked in rounds (more questions than one
// dialog holds). The user is asked to start once, before the first round; the
// later rounds of the same quiz go straight to them.

import type { QuestionCount } from './questionCount'

export class QuizRounds {
  private quiz: { count: QuestionCount; asked: number } | undefined

  // The questions asked in earlier rounds, or undefined when no quiz is going on.
  get askedSoFar(): number | undefined {
    return this.quiz?.asked
  }

  // The count the quiz in progress keeps to, set at its first round.
  get count(): QuestionCount | undefined {
    return this.quiz?.count
  }

  // A round was answered. A sized quiz with every question asked is over.
  recordRound(count: QuestionCount, asked: number): void {
    const quiz = this.quiz ?? { count, asked: 0 }
    quiz.asked += asked
    this.quiz = quiz.count.mode === 'size' && quiz.asked >= quiz.count.exact ? undefined : quiz
  }

  // Graded, dismissed, or a new turn: the next quiz call starts a new quiz.
  end(): void {
    this.quiz = undefined
  }
}

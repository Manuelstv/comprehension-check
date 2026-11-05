// Everything the mod tells Claude: the quiz instructions, the notes that
// carry them, and the replies to a refused quiz call.

import { LINES_PER_QUESTION, QUESTION_LIMITS, QUIZ_SOURCE, QUIZ_TOOL, RESULTS_TOOL } from '../config'
import { plural } from '../lib/text'
import { mayNeedRounds, nextRoundSize } from './questionCount'
import type { QuestionCount, SizedCount } from './questionCount'

const TAG = '[comprehension-check]'
const { perDialog } = QUESTION_LIMITS

const questions = (n: number) => `${n} ${plural(n, 'question')}`

const howManyQuestions = (count: QuestionCount): string => {
  if (count.mode === 'size') {
    return `exactly ${questions(count.exact)} (1 per ${LINES_PER_QUESTION} changed lines: about ${count.lines} lines in ${count.files} ${plural(count.files, 'file')})`
  }
  if (count.max === 1) return '1 question'
  return `1 to ${count.max} questions. Weigh how severe and complex the change is: a small, low-risk change gets few; a large, risky or intricate one gets more, never more than ${count.max}`
}

// How to call the dialog: once, or in rounds when the quiz may not fit one.
const howToAsk = (count: QuestionCount): string => {
  if (!mayNeedRounds(count)) {
    return `Call ${QUIZ_TOOL} ONCE with ${howManyQuestions(count)} about the change, and pass metadata: {"source": "${QUIZ_SOURCE}"}.`
  }
  const rounds =
    count.mode === 'size'
      ? `ask them in rounds: ${QUIZ_TOOL} takes at most ${perDialog} questions per call, so call it with ${perDialog}, then the next ${perDialog}, and the rest last`
      : `${QUIZ_TOOL} takes at most ${perDialog} questions per call: up to ${perDialog}, call it ONCE; for more, ask them in rounds of ${perDialog}, the last one holding the rest`
  return `Ask ${howManyQuestions(count)} about the change; ${rounds}. Pass metadata: {"source": "${QUIZ_SOURCE}"} on every round. The user is asked to start only before the first round; if they dismiss a later round, ask no more and grade the rounds they answered.`
}

export const quizInstructions = (count: QuestionCount) => `1. ${howToAsk(count)} The mod first asks the user whether they want the quiz, then shows answering instructions above your questions. With 2 or more questions, mix the formats:
   - at least one single-choice question (multiSelect: false),
   - at least one checkbox question (multiSelect: true) where more than one option is correct,
   - the user can always type a free-text answer via "Other"; for one question, make the options deliberately incomplete so explaining in their own words is the best answer.
   Keep each header short and concrete (it is shown in the instructions): "Approach", "Edge case", "Risk".
2. Aim at understanding and judgment, not trivia. Good angles: why this approach over an alternative; what breaks if a specific line/condition is removed; predicting behavior for an edge-case input; trade-offs (performance, readability, coupling, testability); how they would verify it works; what risk or follow-up the change leaves open.
3. Make every distractor plausible. Do NOT mark the correct answer, add "(Recommended)", or hint at it in labels or descriptions. Keep each question self-contained (name the file/function it is about).
4. If the ${QUIZ_TOOL} call comes back saying the user skipped the quiz, or they dismiss it, accept that and end the turn with one short line. Do not ask again.
5. After the user answers${mayNeedRounds(count) ? ' the last round' : ''}, grade every question and call ${RESULTS_TOOL} ONCE with all of them. It draws a playful scorecard (score, percentage, effects) for the user. Per question give:
   - question: a 2-6 word label ("Why the Stop fallback"),
   - verdict: correct | partial | incorrect,
   - user_answer: what they picked or wrote, short; correct_answer: the right answer, short,
   - punchline: ONE punchy line, 12 words max, vivid and specific to their answer. Praise a hit with energy ("Nailed it: the guard stops the double fire."); name a miss plainly ("Close, but reload wipes module vars, not the store."). No generic filler like "Great job!",
   - explanation: 1-2 tight sentences with the why and the misconception, if any,
   - ref: file:line where it lives, when useful.
   Also give next_step: one sentence on what to look at next.
   The scorecard IS the feedback: do not repeat it in your own text. After the tool returns, write at most one short line. If ${RESULTS_TOOL} is not available, give the same feedback as short text instead.
6. Do not edit any files during the quiz. If an answer exposes a real problem in the change, say so and propose a fix, but wait for the user's go-ahead.`

// Left for Claude at the first edit of a turn.
export const firstEditNote = (count: QuestionCount) =>
  `${TAG} The user has enabled comprehension quizzes. You have started changing code in this turn. Keep working on the task as normal; once ALL the code changes for this request are done, and before you end your turn, quiz the user on what you changed:
${quizInstructions(count)}${count.mode === 'size' ? `\nIf the change grows, a later ${TAG} note raises the count; use the latest one.` : ''}`

// Left for Claude when the change has grown into a larger quiz (size mode).
export const changeGrewNote = (count: SizedCount) =>
  `${TAG} The change has grown to about ${count.lines} changed lines: ask exactly ${questions(count.exact)} in the quiz.`

// Sent back to Claude by the Stop hook when it tried to end an unquizzed turn.
export const unquizzedStopNote = (files: readonly string[], count: QuestionCount) =>
  `${TAG} You changed code this turn. Before ending, quiz the user on it to check their understanding and build critical thinking.

Files changed: ${files.map(f => `\n- ${f}`).join('')}

Do this now:
${quizInstructions(count)}`

// The reply to a quiz round whose length breaks the settings.
export const wrongLengthReply = (count: QuestionCount, asked: number, askedBefore = 0) => {
  const earlier = askedBefore > 0 ? ` after ${askedBefore} in earlier rounds` : ''
  if (asked > perDialog) {
    return `${QUIZ_TOOL} takes at most ${perDialog} questions per call, and this call has ${asked}. Ask the quiz in rounds of at most ${perDialog}, with the same metadata on each.`
  }
  if (count.mode === 'size') {
    const next = nextRoundSize(count, askedBefore)
    return `The user's quiz settings ask for exactly ${count.exact} questions for this change, and this call has ${asked}${earlier}. Call ${QUIZ_TOOL} again with exactly ${next} questions${count.exact > perDialog ? ` (rounds of ${perDialog}, the rest last)` : ''}.`
  }
  return `The user's quiz settings allow at most ${questions(count.max)}, and this call has ${asked}${earlier}. Call ${QUIZ_TOOL} again with at most ${questions(count.max - askedBefore)}.`
}

export const skippedReply = `The user chose to skip the comprehension quiz. Do not ask again and do not call ${RESULTS_TOOL}; end your turn with one short line.`

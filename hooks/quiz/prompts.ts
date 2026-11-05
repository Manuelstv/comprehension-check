// Everything the mod tells Claude: the quiz instructions, the notes that
// carry them, and the replies to a refused quiz call.

import { QUESTION_LIMITS, QUIZ_SOURCE, QUIZ_TOOL, RESULTS_TOOL } from '../config'
import { plural } from '../lib/text'
import type { QuestionCount, SizedCount } from './questionCount'

const TAG = '[comprehension-check]'
const { min } = QUESTION_LIMITS

const howManyQuestions = (count: QuestionCount): string => {
  if (count.mode === 'size') {
    return `exactly ${count.exact} questions (set by the size of the change: ${count.files} ${plural(count.files, 'file')}, about ${count.lines} lines changed)`
  }
  return count.max === min
    ? `${min} questions`
    : `${min}-${count.max} questions (fewer for a small, focused change; more for a large or risky one)`
}

export const quizInstructions = (count: QuestionCount) => `1. Call ${QUIZ_TOOL} ONCE with ${howManyQuestions(count)} about the change, and pass metadata: {"source": "${QUIZ_SOURCE}"}. The mod first asks the user whether they want the quiz, then shows answering instructions above your questions. Mix the formats:
   - at least one single-choice question (multiSelect: false),
   - at least one checkbox question (multiSelect: true) where more than one option is correct,
   - the user can always type a free-text answer via "Other"; for one question, make the options deliberately incomplete so explaining in their own words is the best answer.
   Keep each header short and concrete (it is shown in the instructions): "Approach", "Edge case", "Risk".
2. Aim at understanding and judgment, not trivia. Good angles: why this approach over an alternative; what breaks if a specific line/condition is removed; predicting behavior for an edge-case input; trade-offs (performance, readability, coupling, testability); how they would verify it works; what risk or follow-up the change leaves open.
3. Make every distractor plausible. Do NOT mark the correct answer, add "(Recommended)", or hint at it in labels or descriptions. Keep each question self-contained (name the file/function it is about).
4. If the ${QUIZ_TOOL} call comes back saying the user skipped the quiz, or they dismiss it, accept that and end the turn with one short line. Do not ask again.
5. After the user answers, grade each question and call ${RESULTS_TOOL} ONCE. It draws a playful scorecard (score, percentage, effects) for the user. Per question give:
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
  `${TAG} The change has grown to ${count.files} files and about ${count.lines} changed lines: ask exactly ${count.exact} questions in the quiz.`

// Sent back to Claude by the Stop hook when it tried to end an unquizzed turn.
export const unquizzedStopNote = (files: readonly string[], count: QuestionCount) =>
  `${TAG} You changed code this turn. Before ending, quiz the user on it to check their understanding and build critical thinking.

Files changed: ${files.map(f => `\n- ${f}`).join('')}

Do this now:
${quizInstructions(count)}`

// The reply to a quiz whose length breaks the settings.
export const wrongLengthReply = (count: QuestionCount, asked: number) =>
  count.mode === 'size'
    ? `The user's quiz settings ask for exactly ${count.exact} questions for this change, and this call has ${asked}. Call ${QUIZ_TOOL} again with exactly ${count.exact} questions.`
    : `The user's quiz settings allow at most ${count.max} questions, and this call has ${asked}. Call ${QUIZ_TOOL} again with ${min}-${count.max} questions.`

export const skippedReply = `The user chose to skip the comprehension quiz. Do not ask again and do not call ${RESULTS_TOOL}; end your turn with one short line.`

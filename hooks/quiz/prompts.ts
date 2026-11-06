// Everything the mod tells Claude: the quiz instructions, the notes that
// carry them, and the replies to a refused quiz call.

import { LINES_PER_QUESTION, QUESTION_LIMITS, QUIZ_SOURCE, QUIZ_TOOL, RESULTS_TOOL } from '../config'
import type { Perspective, Wording } from '../config'
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
    return `Call ${QUIZ_TOOL} ONCE with ${howManyQuestions(count)}. Pass metadata: {"source": "${QUIZ_SOURCE}"}.`
  }
  const rounds =
    count.mode === 'size'
      ? `ask them in rounds: ${QUIZ_TOOL} takes at most ${perDialog} questions per call, so call it with ${perDialog}, then the next ${perDialog}, and the rest last`
      : `${QUIZ_TOOL} takes at most ${perDialog} questions per call: up to ${perDialog}, call it ONCE; for more, ask them in rounds of ${perDialog}, the last one holding the rest`
  return `Ask ${howManyQuestions(count)}; ${rounds}. Pass metadata: {"source": "${QUIZ_SOURCE}"} on every round. The user is asked to start only before the first round; if they dismiss a later round, ask no more and grade the rounds they answered.`
}

// What the quiz is for. Every rule after it serves this.
export const QUIZ_GOAL = `The goal is the user's critical thinking, not their memory. Code an agent wrote is easy to accept without reading it; the quiz checks that the user still owns this change: they can explain what it does, defend it to whoever will maintain it, and say what it does not cover. Ask what a sharp reviewer would ask before approving it.`

// `elsewhere`: what belongs to the other lenses, kept out of this one.
// `hunt`: what to look for in the diff before writing, so the quiz is built
// on the corner cases and unwanted behavior the change really has.
type Lens = { name: string; focus: string; elsewhere: string; angles: readonly string[]; hunt?: string }

// The angles each perspective asks from. `mixed` draws on all three.
export const LENSES: Record<Exclude<Perspective, 'mixed'>, Lens> = {
  code: {
    name: 'Code',
    focus: 'how the change behaves, line by line',
    elsewhere: 'system design, deployment and user impact',
    angles: [
      'predict: the exact result of an added or changed line for a concrete input at its edge (empty, missing, zero, negative, a duplicate, exactly at a limit, one past it)',
      'find the input: which of several concrete inputs make the new code misbehave (a checkbox question fits), or the smallest input that does',
      'what breaks if a specific line, guard or condition is removed, reordered, inverted or moved off by one',
      'failure paths in the new code: a throw or rejection halfway through, the state it leaves behind, a retry, a timeout',
      'state across calls: the same call twice, two calls interleaved, a shared or module-level value, a mutated argument',
      'existing callers the diff did not touch: what they now get differently (a value, a type, an error, a delay)',
      'what the tests or checks prove, and which plausible bug in the new code they would still let through',
      'a decision Claude made, asked as what it makes a concrete call return or do, never as whether it was the right design',
    ],
    hunt: 'Before writing, review the diff as a reviewer hunting for bugs. Go through every added and changed line and try the edges on it: empty, missing (null, undefined, absent key), zero, negative, a duplicate, exactly at a limit and one past it, a throw or rejection halfway, the same call twice, and each existing caller of a changed function. Note every input that gives a wrong, surprising or unhandled result.',
  },
  architecture: {
    name: 'Architecture',
    focus: 'how the change fits the system',
    elsewhere: 'line-by-line results and user-facing impact',
    angles: [
      'why this design over a named alternative, and what it trades away',
      'boundaries and coupling: what now depends on what, where state lives, who owns it',
      'blast radius: what else must change in step, and what could break far from the diff',
      'behavior under load, concurrency, ordering or partial failure, and how reversible the change is',
      'unwanted behavior over time or at scale: growth with no bound, duplicates after a retry, old and new versions running side by side, a restart',
      'what the tests cannot show about the running system: other instances, real load, callers they skip',
    ],
    hunt: 'Before writing, look for unwanted behavior the change brings to the system, beyond what the diff shows: other callers and the data they pass, several instances or processes at once, a retry or a duplicate message, a partial failure between two steps, a deploy where old and new code run together, and growth over days of traffic. Note every case where the system would end up wrong, inconsistent or degraded.',
  },
  product: {
    name: 'Product',
    focus: 'what the change means for the people who use it',
    elsewhere: 'line-level mechanics and internal design with no user consequence',
    angles: [
      'what a user now sees or does differently, and which users it affects',
      'defaults, scope cuts and requirements Claude chose or reinterpreted on the user\'s behalf',
      'what was left out, and whether it is safe to ship without it',
      'how they would know it works for users, beyond a green test: what to try, measure or tell them',
    ],
  },
}

const angleList = (lens: Lens) => lens.angles.map(angle => `\n   - ${angle}`).join('')

// What to do with what the hunt found. The question puts the finding to the
// user without naming it, so they have to find it themselves.
export const HUNT_USE = `Build at least one question on the most serious finding: give the concrete input or situation and ask what happens, or ask which input or situation breaks it. Do not say in the question that it is a bug; the user should spot it. If you find nothing wrong, ask about the case that comes closest to breaking. A finding that is a real bug goes in that question's explanation on the scorecard, and in your one line after it, with an offer to fix it.`

const huntRule = (lenses: readonly Lens[]): string => {
  const hunts = lenses.flatMap(lens => (lens.hunt === undefined ? [] : [lens.hunt]))
  return hunts.length === 0 ? '' : `\n   ${hunts.join(' ')} ${HUNT_USE}`
}

const perspectiveRule = (perspective: Perspective): string => {
  if (perspective === 'mixed') {
    const all = Object.values(LENSES)
    const lenses = all
      .map(lens => `\n   ${lens.name} (${lens.focus}):${angleList(lens).replaceAll('\n   -', '\n     -')}`)
      .join('')
    return `Perspective: mixed. Pick the angles this change actually carries; with 2 or more questions, use at least two lenses.${lenses}${huntRule(all)}`
  }
  const lens = LENSES[perspective]
  return `Perspective: ${lens.name}. The user chose to be quizzed on ${lens.focus}, so EVERY question takes this angle, including the riskiest-part, decision and test questions below. ${lens.elsewhere[0]?.toUpperCase()}${lens.elsewhere.slice(1)} belong to other perspectives: leave them out unless you can ask them as a ${lens.name.toLowerCase()} question. If the change barely touches this angle, ask how it could still reach it rather than switching angle. Good angles:${angleList(lens)}${huntRule([lens])}`
}

// How the quiz reads: the angle its questions take and how they are worded.
// The user's Settings carry both.
export type QuizStyle = { perspective: Perspective; wording: Wording }

// The rules a plain-worded quiz adds. Plain is about the reading, not the
// difficulty: the reasoning a question asks for stays the same.
export const PLAIN_WORDING = `Wording: plain. The user wants to spend their time thinking about the answer, not working out what the question means. Write every question, option and piece of feedback in plain, everyday words:
   - short sentences of about 15 words, one idea each. A question may set the scene in a few such sentences, then asks ONE thing; about 40 words in all. Not "what happens, and why?": the options carry the why,
   - say what each number is: "a price of 10 at 9:00", not "A1 at 10 at 9:00",
   - option labels of 1-4 words that name the idea; descriptions of about 12 words at most,
   - keep each question anchored: still name the function or file it is about, in backticks. Cut the jargon around that name instead: the first time a status code, header or technical term appears, say what it means in a few words ("a 412, the server's answer that someone saved first"), and describe code operators in words ("treats a copied list as changed", not "!== compares references"). This holds for options as much as questions, and each question stands alone: explain a term again in every question that uses it,
   - active voice with a clear subject ("getPrice returns the old price", not "a stale value is returned"), one idea per sentence, no double negatives, no "Which of the following statements is true",
   - when the twist of a question is a negation ("does NOT prove", "is NOT true"), write NOT in capitals so it cannot be missed,
   - in the scorecard, the same plain words: a newcomer to this code reads each punchline, explanation and next_step in one pass.
   Plain words must not make the answer easier to guess: keep the reasoning just as hard and the options just as fair. Every other rule still applies.`

const wordingRules = (wording: Wording): string[] => (wording === 'plain' ? [PLAIN_WORDING] : [])

// `requested`: the user asked for this quiz (`/quiz last` and the like), so
// it goes to them without the yes/no question first.
export type QuizOptions = { requested?: boolean }

const howItReachesThem = ({ requested = false }: QuizOptions) =>
  requested
    ? 'The user asked for this quiz, so it goes straight to them, with answering instructions above your questions.'
    : 'The mod first asks the user whether they want the quiz, then shows answering instructions above your questions.'

const numbered = (rules: readonly string[]) => rules.map((rule, i) => `${i + 1}. ${rule}`).join('\n')

export const quizInstructions = (count: QuestionCount, style: QuizStyle, options: QuizOptions = {}) =>
  numbered([
    `${howToAsk(count)} ${howItReachesThem(options)}`,
    QUIZ_GOAL,
    perspectiveRule(style.perspective),
    ...wordingRules(style.wording),
    `Every question must:
   - be about THIS change: name the file, function or behavior it is about, and turn on what the change added or altered, not on code it left as it was. If someone could answer it without having seen the change, rewrite it,
   - test reasoning (why, what if, what breaks, what it proves), not trivia such as names, syntax, line counts or API spellings,
   - hold one idea and stand alone: the dialog shows only the question and its options.
   Across the quiz, always through the chosen perspective:
   - ask at least one question about a decision Claude made that the user did not ask for: a default, an assumption, something left out of scope, or how two requirements in tension were resolved. Summaries hide these,
   - if the change added or ran tests or checks, ask what they prove and what they would miss: a green check proves one thing,
   - start with the riskiest part of the change, where being wrong costs the most.`,
    `With 2 or more questions, mix the formats:
   - at least one single-choice question (multiSelect: false),
   - at least one checkbox question (multiSelect: true) where more than one option is correct,
   - the user can always type a free-text answer via "Other"; for one question, make the options deliberately incomplete so explaining in their own words is the best answer.
   Keep each header short and concrete (it is shown in the instructions): "Edge case", "Trade-off", "Blast radius", "User impact".`,
    `Give 2-4 options per question. Make every wrong option a mistake a reasonable reader could make (a real misconception, a plausible alternative design, a neighbouring wrong line), stated with a reason just as specific as the right one's. The right option must not stand out by length or precision, the classic give-away: keep every option's label plus description within about 15 characters of the others, and before sending, if the right one is the longest, shorten it or lengthen a wrong one. Vary its position; no "all of the above" or "none of the above". Do NOT mark the correct answer, add "(Recommended)", or hint at it in labels or descriptions.`,
    `If the ${QUIZ_TOOL} call comes back saying the user skipped the quiz, or they dismiss it, accept that and end the turn with one short line. Do not ask again.`,
    `After the user answers${mayNeedRounds(count) ? ' the last round' : ''}, grade every question and call ${RESULTS_TOOL} ONCE with all of them. It draws a playful scorecard (score, percentage, effects) for the user. Grade the reasoning, not the wording: a free-text answer with the core idea is correct; one with part of it, or the right pick for a stated wrong reason, is partial. A checkbox answer is correct only with every right option and no wrong one, partial with some right. Per question give:
   - question: a 2-6 word label ("Why the Stop fallback"),
   - verdict: correct | partial | incorrect,
   - user_answer: what they picked or wrote, short; correct_answer: the right answer, short,
   - punchline: ONE punchy line, 12 words max, vivid and specific to their answer. Praise a hit with energy ("Nailed it: the guard stops the double fire."); name a miss plainly ("Close, but reload wipes module vars, not the store."). No generic filler like "Great job!",
   - explanation: 1-2 tight sentences with the why, tied to the code, and the misconception if any. If their answer exposes a risk you missed, say so here instead of defending the change,
   - ref: file:line where it lives, when useful.
   Also give next_step: one concrete action for their biggest gap (a line to read, a check to run, an input to try), never just "review the code".
   The scorecard IS the feedback: do not repeat it in your own text. After the tool returns, write at most one short line. If ${RESULTS_TOOL} is not available, give the same feedback as short text instead.`,
    `Do not edit any files during the quiz. If an answer exposes a real problem in the change, say so and propose a fix, but wait for the user's go-ahead.`,
  ])

// Left for Claude at the first edit of a turn.
export const firstEditNote = (count: QuestionCount, style: QuizStyle) =>
  `${TAG} The user has enabled comprehension quizzes. You have started changing code in this turn. Keep working on the task as normal; once ALL the code changes for this request are done, and before you end your turn, quiz the user on what you changed:
${quizInstructions(count, style)}${count.mode === 'size' ? `\nIf the change grows, a later ${TAG} note raises the count; use the latest one.` : ''}`

// Left for Claude when the change has grown into a larger quiz (size mode).
export const changeGrewNote = (count: SizedCount) =>
  `${TAG} The change has grown to about ${count.lines} changed lines: ask exactly ${questions(count.exact)} in the quiz.`

// Sent back to Claude by the Stop hook when it tried to end an unquizzed turn.
export const unquizzedStopNote = (files: readonly string[], count: QuestionCount, style: QuizStyle) =>
  `${TAG} You changed code this turn. Before ending, quiz the user on it to check their understanding and build their critical thinking.

Files changed: ${files.map(f => `\n- ${f}`).join('')}

Do this now:
${quizInstructions(count, style)}`

// What an on-demand quiz is about, as Claude is told it.
export type QuizSubject = {
  // "the last 2 commits (a1b2c3d Fix the cache; …)"
  what: string
  // How to read it: the git command, or the files themselves.
  howToRead: string
  // One line per file, largest first, and how many more were left out.
  fileLines: readonly string[]
  moreFiles: number
  files: number
  lines: number
  // True for code as it stands rather than a diff (`/quiz codebase`).
  isWholeCode: boolean
}

// The rules speak of "the change" and "a decision Claude made"; this says
// what those mean when the user picked the code.
const subjectReading = (subject: QuizSubject) =>
  subject.isWholeCode
    ? 'This quiz is on the code as it stands, not on a recent change. In the rules below, "the change" means this code: read its most important and riskiest parts (entry points, core logic, state, error handling); you do not need to read every file. "A decision Claude made" means a design decision in the code that reading it does not explain.'
    : 'In the rules below, "the change" means this diff, whoever wrote it, and "a decision Claude made" means a decision its author made that the diff does not explain.'

// Left for Claude by `/quiz last|uncommitted|codebase`, before the prompt
// that starts the quiz's turn.
export const requestedQuizNote = (subject: QuizSubject, count: QuestionCount, style: QuizStyle) => {
  const more = subject.moreFiles > 0 ? `\n- … and ${subject.moreFiles} more` : ''
  return `${TAG} The user asked to be quizzed on ${subject.what}. Read it first: ${subject.howToRead}

Files: ${subject.files} ${plural(subject.files, 'file')}, about ${subject.lines} lines, largest first:${subject.fileLines.map(line => `\n- ${line}`).join('')}${more}

${subjectReading(subject)}

Then quiz the user:
${quizInstructions(count, style, { requested: true })}`
}

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

// The words for an on-demand quiz: what Claude is told the quiz is about
// (a QuizSubject for quiz/prompts.ts) and the line the user sees when the
// command runs. Pure.

import { ON_DEMAND } from '../config'
import { largestFirst } from '../changes/changeSets'
import { totalLines } from '../changes/changeTracker'
import { plural } from '../lib/text'
import type { QuizSubject } from '../quiz/prompts'
import type { QuestionCount } from '../quiz/questionCount'
import { findSetting } from '../settings/definitions'
import type { Settings } from '../settings/settings'
import type { ScopeSnapshot } from './collectScope'
import { describeScope } from './scopes'

const commitList = (snapshot: ScopeSnapshot) =>
  snapshot.commits.length === 0 ? '' : ` (${snapshot.commits.map(c => `${c.hash} ${c.subject}`).join('; ')})`

const howToRead = (snapshot: ScopeSnapshot): string => {
  switch (snapshot.scope.kind) {
    case 'commits':
      return `\`git show --no-renames ${snapshot.commits.map(c => c.hash).join(' ')}\`.`
    case 'uncommitted':
      return snapshot.untracked.length === 0
        ? '`git diff HEAD` (staged and unstaged together).'
        : '`git diff HEAD` (staged and unstaged together), and the new files marked (new) below, which git does not track yet.'
    case 'codebase':
      return 'the files themselves.'
  }
}

export const subjectOf = (snapshot: ScopeSnapshot): QuizSubject => {
  const untracked = new Set(snapshot.untracked)
  const ranked = largestFirst(snapshot.changes)
  const listed = ranked.slice(0, ON_DEMAND.listedFiles)
  return {
    what: `${describeScope(snapshot.scope)}${commitList(snapshot)}`,
    howToRead: howToRead(snapshot),
    fileLines: listed.map(([path, lines]) => `${path} (${lines} ${plural(lines, 'line')}${untracked.has(path) ? ', new' : ''})`),
    moreFiles: ranked.length - listed.length,
    files: ranked.length,
    lines: totalLines(snapshot.changes),
    isWholeCode: snapshot.scope.kind === 'codebase',
  }
}

const questionsLine = (count: QuestionCount) =>
  count.mode === 'size'
    ? `${count.exact} ${plural(count.exact, 'question')}`
    : `up to ${count.max} ${plural(count.max, 'question')}`

// "🧠 Quiz on the last commit: 2 files, 40 lines · up to 4 questions · Mixed perspective."
export const requestSummary = (snapshot: ScopeSnapshot, count: QuestionCount, settings: Settings): string => {
  const files = snapshot.changes.size
  const lines = totalLines(snapshot.changes)
  const perspective = findSetting('perspective')?.label(settings.perspective) ?? settings.perspective
  return `🧠 Quiz on ${describeScope(snapshot.scope)}: ${files} ${plural(files, 'file')}, ${lines} ${plural(lines, 'line')} · ${questionsLine(count)} · ${perspective} perspective.`
}

// The prompt that starts the quiz's turn, shown in the transcript.
export const requestPrompt = (snapshot: ScopeSnapshot): string => `Quiz me on ${describeScope(snapshot.scope)}.`

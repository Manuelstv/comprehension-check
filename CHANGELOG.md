# Changelog

All notable changes to this mod are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). See [Versioning](README.md#versioning) in the README.

## [Unreleased]

## [0.5.0] - 2026-11-05

### Added

- **Quiz perspective.** `/quiz settings perspective mixed|code|architect|product`, also in the settings menu, sets the angle the questions take. **Code** asks how the change behaves. **Architecture** asks how it fits the system. **Product** asks what it means for users. **Mixed** (the default) draws on whichever of the three the change carries.
- **Evals for the quiz prompt** in `evals/`, run with `claude plugin eval`. They score the quizzes Claude writes, one property per grader: grounded in the change, critical rather than trivia, a question about a decision Claude made, fair options, the chosen perspective, and fair grading. `scripts/build-evals.ts` writes the eval prompts from `hooks/quiz/prompts.ts`, so they test the prompt that ships.

### Changed

- **The quiz prompt is built around critical thinking.** It states the goal first: the user owns the change, can defend it, and knows what it does not cover. Every question must be about this change and make the user reason. One question must be about a decision Claude made that the user did not ask for. Tests are asked about as "what does it prove, and what would it miss". The right option may not stand out by length or precision. Grading weighs reasoning over wording, gives partial credit for a right pick with a wrong reason, and ends with one concrete next step.
- The settings menu has no **Done** row (a dialog holds at most 4 options, and there are now 4 settings). Esc closes it, as before.

## [0.4.0] - 2026-11-05

### Added

- `/quiz settings` lists every setting with its value, as `/config` does. ↑↓ moves, Enter changes the setting in place, and the list comes back with the new value. Sound and Length switch on Enter; Max questions offers 2, 4, 6 or 8, or any number from 1 to 99 typed under Other. Each setting can also be set in one line: `/quiz settings sound on|off`, `/quiz settings max <1-99>`, `/quiz settings length claude|size`.
- **Max questions** is any number from 1 to 99. A quiz of more than 4 questions comes in rounds of up to 4. You are asked to start once, and one scorecard grades every round.
- **Quiz length.** With **Claude decides**, Claude weighs how severe and complex the change is. With **Fits change size**, a quiz has 1 question per 100 changed lines. Both stay within the max. Claude is told the count, and told again if the change grows. A quiz of the wrong length goes back to Claude before you see it. `count agent|size` still works.

### Changed

- Lock files (`pnpm-lock.yaml`, `Cargo.lock`, `*.lock`, …) and git-ignored files no longer count as changes, so editing only those no longer triggers a quiz.
- With Claude deciding, a quiz longer than your max goes back to Claude before you see it.
- `/quiz sound on|off` still works, and is now also available as `/quiz settings sound on|off`.
- The hooks module is split into feature modules (`quiz/`, `changes/`, `settings/`, `scorecard/`, `ui/`, `update/`, `commands/`), with every tunable in `hooks/config.ts`. Unit tests cover the pure parts.

## [0.3.0] - 2026-11-05

### Added

- `/quiz version` shows the installed version and whether a newer one is on `main`.
- `/quiz update` refreshes the marketplace and updates the mod in place (CLI only), then asks you to run `/reload-plugins`. It does nothing when you are already current, and prints the shell commands when it cannot run them.

### Changed

- CI: `actions/checkout` updated to v7.0.1 (Node 24) and pinned to its commit SHA. Git credentials are no longer kept on the runner, jobs have timeouts, and the Claude Code installer is downloaded over HTTPS only before it runs.
- Dependabot keeps the pinned GitHub Actions on their latest releases.

## [0.2.0] - 2026-11-05

### Added

- **Quiz heads-up.** Before the questions, a "🧠 Quiz time!" dialog asks **Yes, quiz me / Not now**, with a banner naming the files and the number of questions. Choosing *Not now*, or pressing Esc, skips the quiz cleanly.
- **Answering instructions** above the quiz: each question listed by number with its format (pick one, or pick all that apply), plus how to answer in your own words and how to skip.
- **Scorecard.** Claude reports grades through the mod's new `quiz_results` tool, drawn as a card: a percentage that counts up next to a bar, a rating line, a ✅/🟡/❌ punchline for each question, your answer next to the right one, an explanation and `file:line`.
- **Effects.** Confetti for 80% or more, a toast with the score, and sounds on macOS (fanfare, chime, womp).
- **Stats.** Quizzes taken, average, best score and the streak of quizzes at 80% or more, shown on the scorecard and through `/quiz stats`.
- `/quiz sound on|off`.
- `CHANGELOG.md`, a release script (`scripts/release.sh`) and a version guard (`scripts/check-version.sh`).
- CI that validates the mod, runs its tests and fails a change to shipped files that does not bump the version.
- A GitHub Release is published for every `vX.Y.Z` tag, with notes taken from this file.
- README sections on updating, versioning, releasing and troubleshooting.

### Changed

- Claude marks the quiz with `metadata.source: "comprehension-check"`, and its feedback is punchier: one line of at most 12 words per answer, then a one- or two-sentence explanation.
- The hooks module is now `hooks/register.tsx` (JSX for the scorecard), with a state contract in `types/index.d.ts`.

## [0.1.0] - 2026-11-05

### Added

- First release. After a turn that changed code, Claude quizzes you on the change with 2–4 questions
  (single choice, checkboxes, free text) and gives per-question feedback.
- Tracks `Edit`, `Write` and `NotebookEdit`, including subagent edits.
- Mid-turn reminder plus a `Stop` hook fallback, so the quiz is asked once per turn.
- `/quiz on|off|status`; the on/off setting persists across sessions.

[Unreleased]: https://github.com/agharsallah/comprehension-check/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/agharsallah/comprehension-check/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/agharsallah/comprehension-check/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/agharsallah/comprehension-check/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/agharsallah/comprehension-check/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/agharsallah/comprehension-check/releases/tag/v0.1.0

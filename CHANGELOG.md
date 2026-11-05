# Changelog

All notable changes to this mod are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). See [Versioning](README.md#versioning) in the README.

## [Unreleased]

### Added

- `/quiz settings`: a menu for sound, the max number of questions (2–4) and who decides the count. Each one can also be set in one line: `/quiz settings sound on|off`, `/quiz settings questions 2|3|4`, `/quiz settings count agent|size`.
- **Count by change size.** With `count size`, the number of questions follows the files touched and the lines changed, up to your max. Claude is told the count, and told again if the change grows. A quiz of the wrong length goes back to Claude before you see it.

### Changed

- Lock files (`pnpm-lock.yaml`, `Cargo.lock`, `*.lock`, …) and git-ignored files no longer count as changes, so editing only those no longer triggers a quiz.
- With Claude deciding, a quiz longer than your max goes back to Claude before you see it.
- `/quiz sound on|off` still works, and is now also available as `/quiz settings sound on|off`.

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

[Unreleased]: https://github.com/agharsallah/comprehension-check/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/agharsallah/comprehension-check/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/agharsallah/comprehension-check/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/agharsallah/comprehension-check/releases/tag/v0.1.0

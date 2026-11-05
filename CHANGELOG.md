# Changelog

All notable changes to this mod are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). See [Versioning](README.md#versioning) in the README.

## [Unreleased]

### Added

- `CHANGELOG.md`, a release script (`scripts/release.sh`) and a version guard (`scripts/check-version.sh`).
- CI that validates the mod, runs its tests and fails a change to shipped files that does not bump the version.
- A GitHub Release is published for every `vX.Y.Z` tag, with notes taken from this file.
- README sections on updating, versioning, releasing and troubleshooting.

## [0.1.0] - 2026-11-05

### Added

- First release. After a turn that changed code, Claude quizzes you on the change with 2–4 questions
  (single choice, checkboxes, free text) and gives per-question feedback.
- Tracks `Edit`, `Write` and `NotebookEdit`, including subagent edits.
- Mid-turn reminder plus a `Stop` hook fallback, so the quiz is asked once per turn.
- `/quiz on|off|status`; the on/off setting persists across sessions.

[Unreleased]: https://github.com/agharsallah/comprehension-check/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/agharsallah/comprehension-check/releases/tag/v0.1.0

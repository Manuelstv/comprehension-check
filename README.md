# comprehension-check

[![CI](https://github.com/agharsallah/comprehension-check/actions/workflows/ci.yml/badge.svg)](https://github.com/agharsallah/comprehension-check/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/agharsallah/comprehension-check?sort=semver)](https://github.com/agharsallah/comprehension-check/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A Claude Code mod that quizzes you on the code Claude just wrote.**

AI-written code is easy to accept without reading. comprehension-check makes every change a short
learning moment. When Claude edits code during a turn, it ends the turn with a few questions about
what it changed. It then tells you which answers were right and why. The aim is that you understand
and can defend every line that lands in your repo.

<sub>An example quiz (illustrative):</sub>

```
╭─ Questions ─────────────────────────────────────────────────────────────╮
│ In src/cache.ts, why does `get()` check `expiresAt` before reading?     │
│   ○ To avoid a race with the background sweeper                         │
│   ○ So a stale entry is never returned between sweeps                   │
│   ○ Because Map.get() is slower than a timestamp compare                │
│   ○ Other…                                                              │
│                                                                         │
│ Which inputs would make `parseRange("…")` throw? (pick all that apply)  │
│   ☐ "10-"     ☐ "5-3"     ☐ "7"     ☐ "a-b"                             │
╰─────────────────────────────────────────────────────────────────────────╯
```

## Contents

- [Install](#install)
- [Usage](#usage)
- [How it works](#how-it-works)
- [Updating](#updating)
- [Versioning](#versioning)
- [Development](#development)
- [Releasing](#releasing)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install comprehension-check --marketplace agharsallah/comprehension-check
```

Answer `y` to add the marketplace, then pick a scope:

| Scope | Applies to |
| --- | --- |
| `user` | Every project on this machine (recommended) |
| `project` | Everyone working in this repo (written to `.claude/settings.json`) |
| `local` | Only you, only in this repo |

From a shell:

```
claude plugin install comprehension-check --marketplace agharsallah/comprehension-check
```

In the desktop app: click **+** next to the prompt box, then **Plugins** → **Add marketplace** with
`agharsallah/comprehension-check`, then **Add plugin**.

Quizzes are on as soon as the mod is installed. To uninstall it, run `claude plugin uninstall comprehension-check`.

## Usage

Work with Claude as usual. When a turn changes code, Claude asks 2–4 questions in a single dialog before it ends the turn:

- **Single choice.** One correct answer and plausible distractors.
- **Checkboxes.** More than one option is correct.
- **Free text.** For at least one question the listed options are incomplete on purpose, so you answer in your own words through **Other**.

The questions cover judgment rather than trivia: why one approach was chosen over another, what breaks if a line is removed,
what happens with an edge-case input, trade-offs, how you would check that it works, and what risk is left.
The correct answer is never marked or hinted at.

After you answer, Claude grades each question as correct, partly correct or incorrect. It explains the reasoning, names the
misconception if there is one, and points to `file:line`. Claude makes no edits during the quiz. If one of your answers shows a
real bug, Claude proposes a fix and waits for you to approve it.

To skip a quiz, dismiss the dialog. The turn then ends and Claude does not ask again.

### Commands

| Command | Effect |
| --- | --- |
| `/quiz on` | Turn quizzes on (the default) |
| `/quiz off` | Turn quizzes off. The setting persists across sessions. |
| `/quiz status` (or `/quiz`) | Show whether quizzes are on |

## How it works

The mod is a single hooks module, [`hooks/register.ts`](hooks/register.ts):

1. **`tool.call`** watches for successful `Edit`, `Write` and `NotebookEdit` calls, including those made by subagents, and records each changed path.
2. On the first edit of a turn it adds a hidden note to the conversation. The note tells Claude to finish the task and then run the quiz.
3. **`classic.Stop`** is the fallback. If Claude tries to end a turn that changed files and has not asked a quiz yet, the hook sends it back once with the list of changed files.
4. An `AskUserQuestion` call from the main agent counts as the quiz and clears the list, so the quiz is asked at most once per turn.
5. The on/off flag is kept in the mod's persistent store (`$.store`).

## Updating

Claude Code installs a fixed copy of the mod. That copy changes only when a **new version** is released, so new commits on `main` alone do not reach you.

**Update by hand:**

```
claude plugin marketplace update comprehension-check
claude plugin update comprehension-check@comprehension-check
```

Then run `/reload-plugins` or restart Claude Code.

**Update automatically:** auto-update is off by default for third-party marketplaces. To turn it on, run `/plugin`, open
**Marketplaces**, select `comprehension-check` and enable auto-update. Claude Code then checks for new versions at startup.

`claude plugin list` shows the version you have installed. The [Releases](https://github.com/agharsallah/comprehension-check/releases) page
and [CHANGELOG.md](CHANGELOG.md) list what changed in each version.

## Versioning

The mod follows [Semantic Versioning](https://semver.org):

| Bump | When | Example |
| --- | --- | --- |
| **major** | The way you use it changes incompatibly | Renaming or removing `/quiz`; changing the default to off |
| **minor** | New behavior that keeps working the old way | A new question format; a new `/quiz` option |
| **patch** | Fixes and prompt tuning | Better distractors; a missed edit tool |

These rules keep updates reliable:

- **`version` in [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json) is the only source of truth.** The marketplace entry
  does not repeat it, because Claude Code silently prefers `plugin.json` and the two would drift.
- **Every change to shipped files needs a version bump.** If code changes but the version does not, Claude Code treats the
  installed copy as current and users never get the change. CI enforces this with
  [`scripts/check-version.sh`](scripts/check-version.sh). Changes to docs, tests, scripts and CI do not need a bump.
- **Every version has a `vX.Y.Z` git tag, a section in [CHANGELOG.md](CHANGELOG.md) and a GitHub Release.**

## Development

Requires [Claude Code](https://docs.claude.com/en/docs/claude-code) 2.1 or later. The type definitions under
`.claude-plugin/types/` are generated by Claude Code when it loads the mod. They are git-ignored.

```
claude plugin validate .        # manifest, marketplace file and hooks module
claude plugin test .            # tests/*.test.ts
claude --plugin-dir .           # a session with the mod loaded from this folder
scripts/check-version.sh        # is the version bumped for what changed vs origin/main?
```

Add each change to the `[Unreleased]` section of [CHANGELOG.md](CHANGELOG.md) in the same PR.

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs validation, tests and the version check on every pull request and every push to `main`.

## Releasing

From a clean `main`:

```
scripts/release.sh patch        # or minor, major, or an explicit 1.4.0
git push origin main v0.1.1     # the script prints the exact command
```

`release.sh` does the following:

1. Bumps `version` in `plugin.json`.
2. Moves the `[Unreleased]` changelog entries under the new version with today's date, and updates the compare links.
3. Runs `claude plugin validate` and `claude plugin test`.
4. Commits `chore(release): vX.Y.Z` and creates the annotated tag `vX.Y.Z`.

When the tag is pushed, CI checks that the tag matches `plugin.json` and publishes a GitHub Release with that version's changelog section as its notes.
Users with auto-update get the new version the next time they start Claude Code. Everyone else gets it the next time they run `claude plugin update`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| No quiz after Claude edited files | Run `/quiz status`. If quizzes are off, run `/quiz on`. |
| No quiz after a change made through Bash | Expected. Edits made with shell commands such as `sed -i` are not tracked (see [Limitations](#limitations)). |
| An update does not show up | Run `claude plugin marketplace update comprehension-check`, then `claude plugin update comprehension-check@comprehension-check`, then restart Claude Code. |
| You want to inspect the hooks | Start with `claude --debug`. Errors from the mod's hooks are logged with the prefix `comprehension-check:`. |

## Limitations

- Changes made through shell commands (`sed -i`, `echo > file`, code generators) are not detected.
- Each quiz is an extra exchange with the model, so it uses more tokens.
- The mod stores its changed-file list in memory. If the mod reloads mid-turn, that turn's quiz can be skipped.

## License

[MIT](LICENSE)

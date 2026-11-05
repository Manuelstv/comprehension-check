# comprehension-check

[![CI](https://github.com/agharsallah/comprehension-check/actions/workflows/ci.yml/badge.svg)](https://github.com/agharsallah/comprehension-check/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/agharsallah/comprehension-check?sort=semver)](https://github.com/agharsallah/comprehension-check/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A Claude Code mod that quizzes you on the code Claude just wrote.**

AI-written code is easy to accept without reading. comprehension-check makes every change a short
learning moment. When Claude edits code during a turn, it ends the turn with a few questions about
what it changed. It then tells you which answers were right and why. The aim is that you understand
and can defend every line that lands in your repo.

It plays out in three beats:

**1. A heads-up.** You choose whether to take the quiz now.

```
🧠 COMPREHENSION CHECK
3 questions · about a minute
On: register.tsx, README.md (+1)
No hints. No penalty. You vs the diff.

 ☐ Quiz time ─────────────────────────────────────────────
 🧠 Quiz time! Ready for 3 quick questions on what Claude just changed?
 ❯ 1. Yes, quiz me
   2. Not now
```

**2. The quiz.** Instructions above the questions tell you how to answer each one.

```
🧠 COMPREHENSION CHECK · 3 questions
◉ Q1 Approach: pick one
☑ Q2 Edge case: pick ALL that apply
◉ Q3 Risk: pick one
✎ Other: answer in your own words
No answer is marked. Esc skips.
```

**3. The scorecard.** It shows your score with a count-up bar, a punchy line for each answer and confetti when you do well.

```
╭──────────────────────────────────────────────────────────────────────╮
│ ✦✧*·+·★✶✦✧*·+·★✶✦✧*·+·★✶✦✧*·                                         │
│ 🔥  83% ████████████████████░░░░ 2.5/3                                │
│ Sharp! Barely a scratch.                                             │
│                                                                      │
│ ✅ Q1 · Why the gate Correct                                          │
│    Nailed it: one hook catches both paths.                           │
│    You said: Intercept the quiz call                                 │
│    Gating the quiz call covers the reminder and the Stop fallback.   │
│    ↳ hooks/register.tsx:318                                          │
│                                                                      │
│ 🟡 Q2 · Skipping the gate Partly                                      │
│    Half there: it also wipes the owed files.                         │
│    You said: Turn ends  ·  Answer: Turn ends, files cleared          │
│    Without clearing, the Stop hook would push Claude straight back.  │
│                                                                      │
│ ➜ Next: Read fitRows and try a 4-question quiz with long headers.    │
│ 📈 7 quizzes · average 81% · best 100% · streak 3 (80%+ in a row)    │
╰──────────────────────────────────────────────────────────────────────╯
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

Work with Claude as usual. When a turn changes code, Claude first asks whether you want the quiz now: **Yes, quiz me** or **Not now**.
If you choose **Not now** or press Esc, the turn ends and Claude does not ask again until the next change.

If you choose yes, Claude asks 2–4 questions in a single dialog. Above the questions, a short guide lists each one by number and format:

- **Single choice.** One correct answer and plausible distractors.
- **Checkboxes.** More than one option is correct.
- **Free text.** For at least one question the listed options are incomplete on purpose, so you answer in your own words through **Other**.

The questions cover judgment rather than trivia: why one approach was chosen over another, what breaks if a line is removed,
what happens with an edge-case input, trade-offs, how you would check that it works, and what risk is left.
The correct answer is never marked or hinted at.

After you answer, Claude grades each question and shows a **scorecard**:

- **Score.** Your percentage counts up next to a bar in the colour of your result. Correct answers score 1 and partly correct answers ½.
- **A rating line** that matches the score, from 🏆 *Flawless* to 💥 *Ouch. Time for a slow re-read.*
- **For each question:** ✅, 🟡 or ❌, a one-line punchline about your answer, what you said next to the right answer, a one- or two-sentence explanation, and the `file:line` it refers to.
- **Effects.** Confetti for 80% or more, a toast with your score, and a short sound (a fanfare for 100%, a chime for 50% or more, a "womp" below that).
- **Your record:** quizzes taken, average, best score, and your streak of quizzes at 80% or more.

Claude makes no edits during the quiz. If one of your answers shows a real bug, Claude proposes a fix and waits for you to approve it.

### Commands

| Command | Effect |
| --- | --- |
| `/quiz on` | Turn quizzes on (the default) |
| `/quiz off` | Turn quizzes off. The setting persists across sessions. |
| `/quiz status` (or `/quiz`) | Show whether quizzes are on |
| `/quiz stats` | Show your record: quizzes, average, best score and streak |
| `/quiz sound on` / `/quiz sound off` | Turn the scorecard sounds on (the default) or off |

## How it works

The mod is a single hooks module, [`hooks/register.tsx`](hooks/register.tsx):

1. **`tool.call`** watches for successful `Edit`, `Write` and `NotebookEdit` calls, including those made by subagents, and records each changed path.
2. On the first edit of a turn it adds a hidden note to the conversation. The note tells Claude to finish the task and then run the quiz.
3. **`classic.Stop`** is the fallback. If Claude tries to end a turn that changed files and has not asked a quiz yet, the hook sends it back once with the list of changed files.
4. Claude marks its quiz with `metadata.source: "comprehension-check"`. The mod intercepts that `AskUserQuestion` call and first asks you
   **Yes / Not now** (`$.ui.ask`). On *Not now*, the call is refused with a note telling Claude to drop the quiz.
5. **`ui.render` on `AskUserQuestion`** adds the banners above both dialogs. They fit the terminal's 12-row budget around the dialog.
6. After grading, Claude calls the mod's own tool, `mcp__comprehension-check__quiz_results`, with structured verdicts and punchlines.
   The mod computes the score, updates your stats and plays the effects. **`ui.render` on `ToolUse`** then draws that call as the scorecard.
   The tool never needs your permission, because the mod allows it in a `tool.check` hook.
7. The on/off and sound settings and your stats are kept in the mod's persistent store (`$.store`). Animation state is session state (`$.state`, typed in [`types/index.d.ts`](types/index.d.ts)).

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
| Quiz appears without the yes/no step | Claude left out `metadata.source`. The quiz still works, without the heads-up. |
| Plain text feedback instead of a scorecard | The mod was reloaded mid-session and the tool was not registered yet. Feedback still arrives, as text. |
| Sounds are too much | Run `/quiz sound off`. |
| No quiz after a change made through Bash | Expected. Edits made with shell commands such as `sed -i` are not tracked (see [Limitations](#limitations)). |
| An update does not show up | Run `claude plugin marketplace update comprehension-check`, then `claude plugin update comprehension-check@comprehension-check`, then restart Claude Code. |
| You want to inspect the hooks | Start with `claude --debug`. Errors from the mod's hooks are logged with the prefix `comprehension-check:`. |

## Limitations

- Changes made through shell commands (`sed -i`, `echo > file`, code generators) are not detected.
- Each quiz is an extra exchange with the model, so it uses more tokens.
- Sounds play only on macOS (`afplay`). Linux and Windows terminals stay silent.
- The mod stores its changed-file list in memory. If the mod reloads mid-turn, that turn's quiz can be skipped.

## License

[MIT](LICENSE)

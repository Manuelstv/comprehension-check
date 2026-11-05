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

If you choose yes, Claude asks up to 4 questions in a single dialog (see [Settings](#settings) for how many). With a max above 4, a longer quiz comes in rounds of up to 4 questions. You are asked to start only once, and one scorecard grades every round. Above the questions, a short guide lists each one by number and format:

- **Single choice.** One correct answer and plausible distractors.
- **Checkboxes.** More than one option is correct.
- **Free text.** For at least one question the listed options are incomplete on purpose, so you answer in your own words through **Other**.

The goal is your critical thinking, not your memory. Code an agent wrote is easy to accept without reading it, and a quiz checks
that you still own the change: you can explain it, defend it to whoever will maintain it, and say what it does not cover. So the questions:

- are about **this** change, naming the file or function. None can be answered from general knowledge.
- make you reason: predict what happens with an edge-case input, say what breaks if a line goes, weigh a trade-off, or find what a green test does not prove.
- include at least one decision Claude made **that you did not ask for**: a default, an assumption, something left out of scope. Summaries hide these.
- never mark or hint at the right answer. Wrong options are mistakes a reasonable reader could make, and the right one is no longer or more precise than the rest.

You choose the **perspective** the questions take (see [Settings](#settings)):

| Perspective | Asks about |
| --- | --- |
| **Mixed** (default) | Whichever of the three below the change actually carries, using at least two when there are 2 or more questions |
| **Code** | How it behaves: the result for a concrete input, failure paths, what breaks if a guard goes, what the tests miss |
| **Architecture** | How it fits: why this design over an alternative, coupling, where state lives, blast radius, behavior under load or partial failure |
| **Product** | What it means for users: what they see differently, who is affected, defaults and scope chosen for them, how you would know it works |

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
| `/quiz settings` | Open the settings menu: sound, max questions, quiz length and perspective |
| `/quiz settings sound on\|off` | Turn the scorecard sounds on (the default) or off. `/quiz sound on\|off` still works. |
| `/quiz settings max <1-99>` | The most questions a quiz may have (default 4). `questions <n>` still works. |
| `/quiz settings length claude\|size` | How the number of questions is chosen: Claude decides (the default), or it fits the size of the change. `count agent\|size` still works. |
| `/quiz settings perspective mixed\|code\|architect\|product` | The angle the questions take (default mixed). `lens` and `view` work too, as do `architecture`, `dev` and `pm`. |
| `/quiz version` | Show the installed version, and whether a newer one is out |
| `/quiz update` | Update the mod to the latest version, then tell you to run `/reload-plugins` |

### Settings

`/quiz settings` opens one list of every setting with its current value, as `/config` does:

```text
Enter changes the setting you pick; Esc when done. Length now: Claude weighs how severe and complex the change is.
❯ 1. Sound: On
  2. Max questions: 4
  3. Length: Claude decides
  4. Perspective: Mixed
```

- **↑ ↓** move, **Enter** changes the setting in place, and the list comes back with the new value.
- **Sound** and **Length** switch on Enter.
- **Max questions** asks for a number: pick 2, 4, 6 or 8, or type any number from 1 to 99 under **Other**.
- **Perspective** lists Mixed, Code, Architecture and Product, each with what it asks about.
- **Esc** closes it. A dialog holds at most 4 options, so there is no Done row.

Each setting can also be set in one line, as in the table above. Settings persist across sessions.

| Setting | Values | Default |
| --- | --- | --- |
| **Sound** | on, off | on |
| **Max questions** | 1–99. No quiz has more. | 4 |
| **Length** | **Claude decides**: Claude weighs how severe and complex the change is and picks how many. **Fits change size**: 1 question per 100 changed lines. Both stay within the max. | Claude decides |
| **Perspective** | **Mixed**, **Code**, **Architecture**, **Product** (see [Usage](#usage)) | Mixed |

With **Fits change size**, 1–100 changed lines get 1 question, 101–200 get 2, and so on, up to your max.
A quiz of more than 4 questions comes in rounds of up to 4. If you press Esc during a later round, Claude asks no more and grades the rounds you answered.

Lines changed are counted as a diff counts them: lines removed plus lines added by each `Edit`, and every line of a `Write`.
If the change grows mid-turn, Claude gets a note with the new count. A quiz of the wrong length goes back to Claude before you see it.

**Lock files and git-ignored files never count**, in either mode. Edits to them alone do not trigger a quiz. Lock files are
`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `Cargo.lock`, `go.sum`, `poetry.lock`, `uv.lock` and any `*.lock`.
Ignored files are the ones `git check-ignore` reports. Outside a git repo, or where git cannot run, nothing counts as ignored.

## How it works

The hooks module's entry point is [`hooks/register.tsx`](hooks/register.tsx). It creates the shared parts once and hands them to each feature:

1. **`tool.call`** (`quiz/quizFlow.ts`) watches for successful `Edit`, `Write` and `NotebookEdit` calls, including those made by subagents, and records each changed path with its line count. Lock files and git-ignored files are skipped.
2. On the first edit of a turn it adds a hidden note to the conversation. The note tells Claude to finish the task and then run the quiz.
3. **`classic.Stop`** is the fallback. If Claude tries to end a turn that changed files and has not asked a quiz yet, the hook sends it back once with the list of changed files.
4. Claude marks its quiz with `metadata.source: "comprehension-check"`. The mod intercepts that `AskUserQuestion` call and first asks you
   **Yes / Not now** (`$.ui.ask`). On *Not now*, the call is refused with a note telling Claude to drop the quiz.
5. **`ui.render` on `AskUserQuestion`** adds the banners above both dialogs. They fit the terminal's 12-row budget around the dialog.
6. After grading, Claude calls the mod's own tool, `mcp__comprehension-check__quiz_results`, with structured verdicts and punchlines.
   The mod computes the score, updates your stats and plays the effects. **`ui.render` on `ToolUse`** then draws that call as the scorecard.
   The tool never needs your permission, because the mod allows it in a `tool.check` hook.
7. The on/off switch, the settings (`settings/settings.ts`) and your stats are kept in the mod's persistent store (`$.store`). Animation state is session state (`$.state`, typed in [`types/index.d.ts`](types/index.d.ts)).

### Code layout

| Path | What it does |
| --- | --- |
| [`hooks/config.ts`](hooks/config.ts) | Every tunable: names, question limits, size steps, lock files, score tiers, timings, update commands |
| `hooks/register.tsx` | The entry point. It creates the change tracker and other shared parts and registers each feature. |
| `hooks/quiz/` | When to quiz: edits, reminders to Claude, the Yes / Not now gate, the Stop fallback, the question count and the prompts |
| `hooks/changes/` | What changed: paths and line counts of edits, lock and git-ignored files, and the files owed a quiz |
| `hooks/settings/` | The settings, defined once as a table (`definitions.ts`), the store (`settings.ts`) and the settings menu (`settingsMenu.ts`) |
| `hooks/scorecard/` | The results tool, grading, score tiers, stats and the scorecard drawing |
| `hooks/ui/` | The banners above the question dialogs |
| `hooks/update/` | `/quiz version` and `/quiz update` |
| `hooks/commands/` | The `/quiz` command |
| `hooks/lib/` | Small helpers with no mod logic: semver, text and safe value reads |
| [`evals/`](evals/README.md) | Model evals of the quiz prompt, run with `claude plugin eval` |
| `scripts/build-evals.ts` | Writes the eval prompts that embed the quiz text, so they never drift from `hooks/quiz/prompts.ts` |

To add a setting, add one entry to `SETTING_DEFINITIONS` in `hooks/settings/definitions.ts`. The command line, the menu and the summary all pick it up. A setting with `choices` gets a picker in the menu. The menu holds at most 4 settings, because a dialog holds at most 4 options.

Two rules of the mod loader shape the code:

- **`$` is passed only to function declarations** that are declared at the top level of a file. So every function that takes `$` is `function name($, …)`, not an arrow function, and `/quiz` dispatches with a `switch`.
- **Each state atom lives in the file that reads or writes it**, with its plugin and key spelled as literals. So `quiz/gateState.ts` and `scorecard/scorecardState.ts` own the session state and expose functions to read and write it.

## Updating

Claude Code installs a fixed copy of the mod. That copy changes only when a **new version** is released, so new commits on `main` alone do not reach you.

**Update from Claude Code:** run `/quiz update`, then `/reload-plugins`. It runs the two commands below for you
(CLI only). `/quiz version` tells you first whether there is anything new.

**Update by hand:**

```
claude plugin marketplace update comprehension-check
claude plugin update comprehension-check@comprehension-check
```

Then run `/reload-plugins` or restart Claude Code.

**Update automatically:** auto-update is off by default for third-party marketplaces. To turn it on, run `/plugin`, open
**Marketplaces**, select `comprehension-check` and enable auto-update. Claude Code then checks for new versions at startup.

`/quiz version` or `claude plugin list` shows the version you have installed. The [Releases](https://github.com/agharsallah/comprehension-check/releases) page
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
claude plugin test .            # tests/*.test.ts: quiz.test.ts drives the hooks, units.test.ts the pure parts
claude --plugin-dir .           # a session with the mod loaded from this folder
scripts/check-version.sh        # is the version bumped for what changed vs origin/main?
```

### Evals

The tests check the code. The [evals](evals/README.md) check the **prompt**: they run real models and score the quizzes Claude writes.
Each property is graded on its own: grounded in the change, critical rather than trivia, a question about a decision Claude made,
fair options, the chosen perspective, and fair grading.

```
bun scripts/build-evals.ts --check   # the generated eval prompts match hooks/quiz/prompts.ts
claude plugin eval . --allow-tools Write Edit mcp__comprehension-check__quiz_results --ablation none
```

Run the evals after any change to `hooks/quiz/prompts.ts`, after running `bun scripts/build-evals.ts`. They call models, so CI does not run them.

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
| Sounds are too much | Run `/quiz settings sound off`. |
| Quizzes are too long | Run `/quiz settings max 2`, or `/quiz settings length size` so small changes get 1 question. |
| No quiz after editing a generated file | Expected if git ignores it, or if it is a lock file (see [Settings](#settings)). |
| No quiz after a change made through Bash | Expected. Edits made with shell commands such as `sed -i` are not tracked (see [Limitations](#limitations)). |
| An update does not show up | Run `/quiz update` and then `/reload-plugins`. From a shell: `claude plugin marketplace update comprehension-check`, then `claude plugin update comprehension-check@comprehension-check`, then restart Claude Code. |
| You want to inspect the hooks | Start with `claude --debug`. Errors from the mod's hooks are logged with the prefix `comprehension-check:`. |

## Limitations

- Changes made through shell commands (`sed -i`, `echo > file`, code generators) are not detected.
- Each quiz is an extra exchange with the model, so it uses more tokens.
- Sounds play only on macOS (`afplay`). Linux and Windows terminals stay silent.
- The mod stores its changed-file list in memory. If the mod reloads mid-turn, that turn's quiz can be skipped.

## License

[MIT](LICENSE)

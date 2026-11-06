# comprehension-check

[![CI](https://github.com/agharsallah/comprehension-check/actions/workflows/ci.yml/badge.svg)](https://github.com/agharsallah/comprehension-check/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/agharsallah/comprehension-check?sort=semver)](https://github.com/agharsallah/comprehension-check/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A Claude Code mod that quizzes you on the code Claude just wrote, or on any commit, diff or codebase you point it at.**

AI-written code is easy to accept without reading. comprehension-check makes every change a short
learning moment. When Claude edits code during a turn, it ends the turn with a few questions about
what it changed. It then tells you which answers were right and why. The aim is that you understand
and can defend every line that lands in your repo. You can also ask for a quiz at any time with
`/quiz last`, `/quiz uncommitted` or `/quiz codebase` (see [Quiz on demand](#quiz-on-demand)).

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

**2. The quiz.** Instructions above the questions tell you how to answer each one. Each format has its own color:
single choice (◉) in blue, checkboxes (☑) in purple with **pick ALL** in bold amber, and the tips in grey.

```
🧠 COMPREHENSION CHECK · 3 questions
◉ Q1 Approach · pick one
☑ Q2 Edge case · pick ALL that apply
◉ Q3 Risk · pick one
✎ Other: answer in your own words
No answer is marked. Esc skips.
```

**3. The scorecard.** The bar maps the quiz, one block per question in its verdict's colour, so you see at a glance which ones you missed.
A miss sets your answer against the right one; a right answer stays short. A real bug the quiz found in the change is flagged ⚠.

```
╭──────────────────────────────────────────────────────────────────────╮
│ ✦✧*·+·★✶✦✧*·+·★✶✦✧*·+·★✶✦✧*·                                         │
│ 🔥  83% ███████ ▓▓▓▓▓▓▓ ███████ 2.5/3                                 │
│ Sharp! Barely a scratch.                                             │
│                                                                      │
│ ✅ Q1 · Why the gate Correct                                          │
│    Nailed it: one hook catches both paths.                           │
│    Gating the quiz call covers the reminder and the Stop fallback.   │
│    ↳ hooks/register.tsx:318                                          │
│                                                                      │
│ 🟡 Q2 · Skipping the gate Partly                                      │
│    Half there: it also wipes the owed files.                         │
│    ◐ You    Turn ends                                                │
│    ✓ Answer Turn ends, files cleared                                 │
│    Without clearing, the Stop hook would push Claude straight back.  │
│    ⚠ In the code: a second skip in one turn leaves files owed.       │
│                                                                      │
│ ✅ Q3 · What the test misses Correct                                  │
│    Spot on: it never answers the gate twice.                         │
│    Each test answers once, so a double gate goes unseen.             │
│                                                                      │
│ ⚠ A real problem in the change (Q2). Ask Claude to fix it.           │
│ ➜ Next: Read fitRows and try a 4-question quiz with long headers.    │
│ 📈 7 quizzes · average 81% · best 100% · streak 3 (80%+ in a row)    │
│    · last 7 ▅▆▄█▆▇▇                                                  │
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
| **Code** | How it behaves: the result for a corner-case input in the new lines, which inputs make it misbehave, failure paths, state across calls, callers it changes, what the tests miss |
| **Architecture** | How it fits: why this design over an alternative, coupling, where state lives, blast radius, behavior under load or partial failure, unwanted behavior over time or at scale |
| **Product** | What it means for users: what they see differently, who is affected, defaults and scope chosen for them, how you would know it works |

With **Code** or **Architecture** in play (Mixed included), Claude first reviews the diff the way a reviewer hunting for bugs would:
it tries the edges on every added line (empty, missing, zero, exactly at a limit, a throw halfway, the same call twice, existing callers),
and for the system, several instances, retries, partial failure, a deploy with old and new code side by side, growth over time.
At least one question is built on the worst thing it finds, without saying it is a bug, so you find it yourself.
If it is a real bug, the scorecard says so and Claude offers a fix.

By default the quiz uses **plain wording**, so your time goes into the answer, not into working out the question:
short one-idea sentences, one ask per question, numbers that say what they are ("a price of 10 at 9:00"), and any
status code or term explained where it appears. The questions are just as hard; only the reading is easier. The
scorecard feedback is written the same way. Set **Wording** to **Standard** for precise technical wording instead.

After you answer, Claude grades each question and shows a **scorecard**:

- **Score.** Your percentage counts up while the bar fills. The bar is a map of the quiz: one block per question, in order, `█` green for correct, `▓` amber for partly, `░` red for missed. Correct answers score 1 and partly correct answers ½.
- **A rating line** that matches the score, from 🏆 *Flawless* to 💥 *Ouch. Time for a slow re-read.*
- **For each question:** ✅, 🟡 or ❌ and a one-line punchline about your answer. A miss or partial answer then sets **◐ You** / **✗ You** against **✓ Answer** on aligned lines, followed by a one- or two-sentence explanation. A correct answer skips the comparison and dims its explanation, so the misses stand out. Each ends with the `file:line` it refers to, and wrapped lines stay indented under their question.
- **Real problems found.** When a question, or your answer, exposed a real bug in the change, the question carries **⚠ In the code:** with the bug and the input that triggers it, and a footer lists those questions so you can ask Claude to fix them.
- **Effects.** Confetti for 80% or more, a toast with your score, and a short sound (a fanfare for 100%, a chime for 50% or more, a "womp" below that).
- **Your record:** quizzes taken, average, best score, your streak of quizzes at 80% or more, and from the second quiz a trend line of your last 10 scores (`▃▅▄▇`). `/quiz stats` shows it too.

Claude makes no edits during the quiz. If one of your answers shows a real bug, Claude proposes a fix and waits for you to approve it.

### Commands

**Run `/quiz` on its own** for a menu of every command, each with what it does. Pick one with ↑ ↓ and Enter; it runs as if you had
typed it. **More commands…** shows the next page (a dialog holds 4 options), and **last** then asks how many commits: 1, 3, 5 or 10,
or type a number. You can also type any command under **Other**, such as `last 5`. Esc closes the menu and shows the status.

```text
 ☐ Quiz
 Quizzes after Claude's edits are on. Pick a command, or type one under Other (like "last 5").
❯ 1. last — Quiz on the last commit, or the last n (1-100)
  2. uncommitted — Quiz on your staged, unstaged and new files
  3. codebase — Quiz on the whole codebase as it stands
  4. More commands…
```

**While typing**, the prompt box completes the command too. Typing `/quiz` lists every command with what it does, to pick with
↑ ↓ and Tab, and Tab finishes a word you have started: `/quiz unc` becomes `/quiz uncommitted`, `/quiz settings p` becomes
`/quiz settings perspective`, and the next word lists the values, the current one marked. Right after a space nothing is listed
(the engine asks plugins only about a word being typed); type the first letter.

| Command | Effect |
| --- | --- |
| `/quiz last [n]` | Quiz you now on the last commit, or the last `n` commits (1–100) |
| `/quiz uncommitted` | Quiz you now on your uncommitted changes: staged, unstaged and new files. `changes`, `diff` and `wip` work too. |
| `/quiz codebase` | Quiz you now on the whole codebase as it stands. `all`, `repo` and `project` work too. |
| `/quiz on` | Turn quizzes on (the default) |
| `/quiz off` | Turn the automatic quizzes after Claude's edits off. The quizzes you ask for still run. The setting persists across sessions. |
| `/quiz` | Open the menu of every command, each with what it does |
| `/quiz status` | Show whether quizzes are on |
| `/quiz stats` | Show your record: quizzes, average, best score and streak |
| `/quiz settings` | Open the settings menu: sound, max questions, quiz length and perspective |
| `/quiz settings sound on\|off` | Turn the scorecard sounds on (the default) or off. `/quiz sound on\|off` still works. |
| `/quiz settings max <1-99>` | The most questions a quiz may have (default 4). `questions <n>` still works. |
| `/quiz settings length claude\|size` | How the number of questions is chosen: Claude decides (the default), or it fits the size of the change. `count agent\|size` still works. |
| `/quiz settings perspective mixed\|code\|architect\|product` | The angle the questions take (default mixed). `lens` and `view` work too, as do `architecture`, `dev` and `pm`. |
| `/quiz settings wording plain\|standard` | How the quiz is written (default plain). `words` works too, as do `simple` and `technical`. |
| `/quiz version` | Show the installed version, and whether a newer one is out |
| `/quiz update` | Update the mod to the latest version, then tell you to run `/reload-plugins` |

### Quiz on demand

The `last`, `uncommitted` and `codebase` commands start a quiz right away on code read from git, whoever wrote it,
including changes made through shell commands, which the automatic quiz misses. The command prints what it found
(`🧠 Quiz on the last commit: 3 files, 120 lines · up to 4 questions · Mixed perspective.`), and Claude asks the quiz in the next turn.

- **Your settings apply.** With **Fits change size**, the lines counted are those in the commits, the uncommitted diff, or (for the codebase) every line of every file.
- **No yes/no step.** You asked for the quiz, so it goes straight to you. Esc still skips it.
- **What is read:** the same files as for any quiz (see [Settings](#settings) for lock and git-ignored files), less binary files. New files git does not track yet count as uncommitted.
- For `/quiz codebase`, Claude reads the most important and riskiest parts rather than every file, and asks about the code as it stands.
- Outside a git repository, or when there is nothing to quiz on, the command says so and no quiz starts.

### Settings

`/quiz settings` lists the settings with their current values, as `/config` does. A dialog holds at most 4 options,
so the list comes in two pages:

```text
Enter changes the setting you pick; Esc when done. Length now: Claude weighs how severe and complex the change is.
❯ 1. Sound: On                         ❯ 1. Perspective: Mixed
  2. Max questions: 4                    2. Wording: Plain
  3. Length: Claude decides              3. Back
  4. More settings…
```

- **↑ ↓** move, **Enter** changes the setting in place, and the list comes back, on the same page, with the new value.
- **More settings…** opens the second page; **Back** returns to the first.
- **Sound**, **Length** and **Wording** switch on Enter.
- **Max questions** asks for a number: pick 2, 4, 6 or 8, or type any number from 1 to 99 under **Other**.
- **Perspective** lists Mixed, Code, Architecture and Product, each with what it asks about.
- **Esc** closes it.

Each setting can also be set in one line, as in the table above. Settings persist across sessions.

| Setting | Values | Default |
| --- | --- | --- |
| **Sound** | on, off | on |
| **Max questions** | 1–99. No quiz has more. | 4 |
| **Length** | **Claude decides**: Claude weighs how severe and complex the change is and picks how many. **Fits change size**: 1 question per 100 changed lines. Both stay within the max. | Claude decides |
| **Perspective** | **Mixed**, **Code**, **Architecture**, **Product** (see [Usage](#usage)) | Mixed |
| **Wording** | **Plain**: short sentences and everyday words. **Standard**: precise technical wording, as dense as the change calls for. | Plain |

With **Fits change size**, 1–100 changed lines get 1 question, 101–200 get 2, and so on, up to your max.
If you press Esc during a later round of a long quiz, Claude asks no more and grades the rounds you answered.

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
   Each line is built from parts with a role (`ui/bannerLines.ts`), and `BANNER_TONES` in `config.ts` maps each role to a theme color.
   The terminal draws the dialog's own text plain, so the colors live in the banner.
6. After grading, Claude calls the mod's own tool, `mcp__comprehension-check__quiz_results`, with structured verdicts and punchlines.
   The mod computes the score, updates your stats and plays the effects. **`ui.render` on `ToolUse`** then draws that call as the scorecard.
   The tool never needs your permission, because the mod allows it in a `tool.check` hook.
7. **`/quiz last|uncommitted|codebase`** reads the scope from git and returns the quiz instructions as the command's hidden `context`.
   The engine refuses a prompt submitted while a `command.run` hook is running, and a local command has no turn around it
   (no `turn.complete`), so a detached task submits the short prompt (`Quiz me on the last commit.`) once the hook has returned.
   In the turn that prompt starts, the quiz call skips the yes/no step and is sized on the requested changes. A later turn
   drops the request. If the prompt does not go in, the reason is logged for `claude --debug`.
8. The on/off switch, the settings (`settings/settings.ts`) and your stats are kept in the mod's persistent store (`$.store`). Animation state is session state (`$.state`, typed in [`types/index.d.ts`](types/index.d.ts)).

### Code layout

| Path | What it does |
| --- | --- |
| [`hooks/config.ts`](hooks/config.ts) | Every tunable: names, question limits, size steps, lock files, score tiers, timings, update commands |
| `hooks/register.tsx` | The entry point. It creates the change tracker and other shared parts and registers each feature. |
| `hooks/quiz/` | When to quiz: edits, reminders to Claude, the Yes / Not now gate, the Stop fallback, the question count, the prompts, and the quiz the user asked for (`quizRequest.ts`) |
| `hooks/scopes/` | Quizzes on demand: the scopes (`scopes.ts`), the git output parsers (`gitOutput.ts`), reading a scope from git (`collectScope.ts`), the words for it (`scopeText.ts`) and the command flow (`requestQuiz.ts`) |
| `hooks/changes/` | What changed: paths and line counts of edits, lock and git-ignored files, and the files owed a quiz |
| `hooks/settings/` | The settings, defined once as a table (`definitions.ts`), the store (`settings.ts`) and the settings menu (`settingsMenu.ts`) |
| `hooks/scorecard/` | The results tool, grading, score tiers, stats and the scorecard drawing |
| `hooks/ui/` | The banners above the question dialogs, and the paged pick-list both menus use (`pickList.ts`, `menuPages.ts`) |
| `hooks/update/` | `/quiz version` and `/quiz update` |
| `hooks/commands/` | The `/quiz` command, its subcommand table (`subcommands.ts`), its menu (`commandMenu.ts`) and its autocomplete (`completions.ts`) |
| `hooks/lib/` | Small helpers with no mod logic: semver, text, timers and safe value reads |
| [`evals/`](evals/README.md) | Model evals of the quiz prompt, run with `claude plugin eval` |
| `scripts/build-evals.ts` | Writes the eval prompts that embed the quiz text, so they never drift from `hooks/quiz/prompts.ts` |

To add an on-demand scope, add one entry to `SCOPE_DEFINITIONS` in `hooks/scopes/scopes.ts` and a case to `snapshotOf` in `hooks/scopes/collectScope.ts`.
TypeScript then points to every `switch` on the scope kind that needs a case.

To add a setting, add one entry to `SETTING_DEFINITIONS` in `hooks/settings/definitions.ts`. The command line, the menu and the summary all pick it up. A setting with `choices` gets a picker in the menu. Past 4 settings the menu pages itself (`menuPages` in `settingsMenu.ts`): 3 settings a page and a row to the next.

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

The test harness starts and ends turns only when a test says so, and the real engine does not always do what a test does.
A local command such as `/quiz last` has no turn around it, and the engine refuses a prompt submitted while a hook runs.
So check any flow that depends on when events fire in a live session, as well as in tests: `claude --plugin-dir .`, or headless with
`claude -p --input-format stream-json --output-format stream-json --verbose --plugin-dir . --debug-file <path>`.

### Evals

The tests check the code. The [evals](evals/README.md) check the **prompt**: they run real models and score the quizzes Claude writes.
Each property is graded on its own: grounded in the change, critical rather than trivia, a question about a decision Claude made,
fair options, the chosen perspective, plain wording, and fair grading.

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
| No quiz after a change made through Bash | Expected. Edits made with shell commands such as `sed -i` are not tracked. Run `/quiz uncommitted` to be quizzed on them. |
| `/quiz last` (or `uncommitted`, `codebase`) prints its summary, but no quiz follows | Run `claude --debug` and look for `comprehension-check: the quiz prompt did not go in`, which gives the reason. Another plugin may have refused the prompt. |
| An update does not show up | Run `/quiz update` and then `/reload-plugins`. From a shell: `claude plugin marketplace update comprehension-check`, then `claude plugin update comprehension-check@comprehension-check`, then restart Claude Code. |
| You want to inspect the hooks | Start with `claude --debug`. Errors from the mod's hooks are logged with the prefix `comprehension-check:`. |

## Limitations

- Changes made through shell commands (`sed -i`, `echo > file`, code generators) do not trigger a quiz. `/quiz uncommitted` covers them.
- Quizzes on demand need a git repository.
- Each quiz is an extra exchange with the model, so it uses more tokens.
- Sounds play only on macOS (`afplay`). Linux and Windows terminals stay silent.
- The mod stores its changed-file list in memory. If the mod reloads mid-turn, that turn's quiz can be skipped.

## License

[MIT](LICENSE)

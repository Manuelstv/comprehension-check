# Evals

`claude plugin test` checks that the mod's code works: hooks, settings, the gate and the scorecard math.
These evals check the **prompt**: whether the quiz Claude writes from it builds critical thinking.
They run real models with `claude plugin eval` and score what comes back.

## Run

```
claude plugin eval . --allow-tools Write Edit mcp__comprehension-check__quiz_results --ablation none
```

- `--allow-tools Write Edit` is needed by the end-to-end cases, where Claude edits files to trigger the mod. `allowed_tools` in a case cannot grant them.
- `--allow-tools mcp__comprehension-check__quiz_results` lets the `grading` case call the scorecard tool.
- `--ablation none` skips the no-plugin baseline arm. Leave it out to measure what the mod adds: without the mod nobody asks for a quiz, so the quiz graders fail in the baseline arm.
- Each case runs 3 times by default. Use `--runs 1` while iterating, and `--case <glob>` to run one case.
  `--case` takes one glob, and a second `--case` replaces the first.
- A full run at `--runs 1` costs about $1 and takes under 2 minutes with `-j 3`.

Results and an HTML report go to `evals/results/` (git-ignored).

## Cases

| Case | Kind | What it checks |
| --- | --- | --- |
| `retry-backoff` | End to end, live prompt | Claude makes a real change. The mod injects its instructions, and the quiz Claude writes (default **mixed** perspective, **plain** wording) is grounded in the change, makes the user reason, asks about a decision Claude made on its own, mixes formats, gives nothing away and reads easily. |
| `no-change-no-quiz` | End to end | A turn that edits nothing gets no quiz. |
| `lens-code`, `lens-architecture`, `lens-product` | Generated prompt | The same price-cache change under each perspective. The quiz keeps to the lens and stays grounded and critical. The change is chosen to read differently through each lens: a TTL boundary and an untested expiry (code), a per-instance cache with no invalidation (architecture), shoppers charged a stale price at checkout (product). |
| `grading` | Generated prompt | Claude grades fixed answers fairly: reasoning over wording, partial credit, a right pick with a wrong stated reason. It reports the grades through the scorecard tool and does not repeat them as text. |
| `wording-plain` | Generated prompt | With **plain** wording, the quiz on a jargon-heavy change (`If-Match`/ETag, 412 retries, a field-by-field merge) is easy to read and still grounded, critical and fair. The change is chosen to be hard to talk about plainly; on the simpler price-cache change, standard wording already reads plainly and the two modes look alike. |
| `wording-standard` | Generated prompt | The control for `wording-plain`: the same change with **standard** wording, graded on the same quality properties. If plain wording costs depth, the gap shows here. |
| `grading-plain` | Generated prompt | With plain wording, the same fixed answers get the same verdicts, and the scorecard feedback is easy to read. |

### Graders

Graders that need no judgment are deterministic `regex` or `tool_used` checks:
the quiz carries the mod's `metadata.source`, has at least one single-choice and one checkbox question, uses no answer markers, and gets the verdicts the fixed answers call for.
Graders that need judgment are `llm` rubrics, one property per file, so a failure names the property that broke:

| Grader | Property |
| --- | --- |
| `grounded` | Every question is about this change; none can be answered from general knowledge. |
| `critical-thinking` | Questions make the user predict, weigh, or find what a check misses. No trivia. |
| `hidden-decision` | At least one question is about a choice Claude made that the user did not ask for. |
| `fair-options` | No absurd distractor, no marker and no much longer option singles out the answer. |
| `lens` | Every question takes the chosen perspective, judged by how it is answered, not by what it mentions. |
| `plain-words` | A newcomer to the code reads each question and option in one pass: short one-idea sentences, one ask, numbers that say what they are, terms explained where they appear. At most one question may slip. |
| `plain-feedback` | The same for the scorecard: punchlines, explanations and `next_step`. |

Plain wording also has deterministic checks: `short-questions` (under 300 characters), `short-options` (descriptions under 100) and `no-wrapper` (no "Which of the following statements").

### Calibrating the wording graders

A readability rubric that every quiz fails, or every quiz passes, measures nothing. So `plain-words` and `plain-feedback` were checked against
quizzes of known kind with the default judge (haiku, 3 votes each) before being trusted:

| Input | `plain-words` verdict |
| --- | --- |
| Plain quizzes from `wording-plain` | 4 of 6 pass |
| Standard quizzes from `wording-standard` | 0 of 3 pass |
| A dense quiz written without the rule | fails |

The first version of `plain-words` required every check to hold for every question. It failed plain and standard quizzes alike, though
plain ones broke 1–2 questions in 4 and standard ones all 4. It also marked a scenario told in several short steps as hard to read, which
judges the reasoning, not the wording. Both were fixed. If you change either rubric, re-run this check against the `wording-standard` quizzes:
a rubric the control passes no longer tells the two modes apart.

## Why some prompts are generated

Eval runs are headless. `AskUserQuestion` does not exist there, so a quiz can never be asked for real.
Every case adds a system-prompt note that tells Claude to print the `AskUserQuestion` input it would send as a JSON block, and the graders read that.

- **End-to-end cases** get the real instructions from the mod itself, so they always test the shipped prompt. They run with the default settings (an eval run starts with an empty store), so they cover the **mixed** perspective.
- **Generated cases** need a perspective other than the default, or a quiz already answered. Their `prompt.md` embeds the text from `hooks/quiz/prompts.ts`, written by `scripts/build-evals.ts`. Regenerate them after any change to the prompt:

```
bun scripts/build-evals.ts          # rewrite evals/<case>/prompt.md
bun scripts/build-evals.ts --check  # exit 1 when one is stale
```

Only `prompt.md` is generated. The graders are written by hand.

## Adding a case

1. For an end-to-end case, write `evals/<name>/prompt.md` by hand and copy the `append_system_prompt` note from `retry-backoff`.
   For a case that needs a setting or a fixed conversation, add it to `CASES` in `scripts/build-evals.ts` and run the script.
2. Add graders in `evals/<name>/graders/`. Write each `llm` rubric with a PASS and a FAIL condition about one property, and name the code it is about, so the judge does not have to guess.
3. Run it at `--runs 2` and read the quizzes in the report before trusting the score. An LLM grader can be wrong, and a too-strict rubric reads like a prompt bug.

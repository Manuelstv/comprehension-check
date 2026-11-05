# comprehension-check

A Claude Code mod that turns every code change into a short learning moment.
When Claude edits code in a turn, it finishes by quizzing you on what it just
changed: single-choice questions, checkbox questions with more than one right
answer, and free-text answers. It then gives you feedback on each answer.
The point is to understand the code that lands in your repo, not just accept it.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install comprehension-check --marketplace agharsallah/comprehension-check
```

Answer `y` to add the marketplace, then pick a scope (user, project or local).

From a shell:

```
claude plugin install comprehension-check --marketplace agharsallah/comprehension-check
```

## What it does

- Tracks successful `Edit`, `Write` and `NotebookEdit` calls, including those made by subagents.
- On the first edit of a turn, it leaves Claude a hidden note to quiz you once the work is done.
- At the end of the turn, if Claude still hasn't asked, a Stop hook sends it back to ask.
- Claude asks 2–4 questions in one `AskUserQuestion` dialog, covering why this approach was chosen,
  what breaks if a line is removed, edge-case behaviour, trade-offs, how to verify the change, and remaining risks.
  The correct answer is never marked or hinted at.
- After you answer, Claude tells you for each question whether you were right, partly right or wrong, and why,
  with `file:line` pointers. It makes no edits during the quiz.
- It asks once per turn. If you dismiss the dialog, the turn ends.

## Commands

| Command | Effect |
| --- | --- |
| `/quiz on` | Turn quizzes on (the default) |
| `/quiz off` | Turn quizzes off. The setting is kept across sessions. |
| `/quiz status` | Show whether quizzes are on |

## Limitations

- Changes made through shell commands (`sed -i`, `echo > file`) are not detected.
- Each quiz is an extra exchange with the model, so it costs some tokens.

## Development

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .   # run a session with the mod loaded from this folder
```

## License

MIT

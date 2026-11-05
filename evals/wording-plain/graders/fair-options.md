---
type: llm
---
Look only at the JSON quiz (AskUserQuestion input) at the end of the reply. Do not try to work
out which option is right. For each question, check its options:

1. Is any option absurd or a joke, obviously wrong even to a developer who has not read the
   code (e.g. "The server explodes", "It deletes the database")?
2. Does any header, label or description signal the answer: a marker such as "Recommended",
   "correct", "best" or "safest", or one option about twice as long as every other?
3. Does any question have more than 4 options?

A question may list only wrong or partial options on purpose, so the user explains in their own
words under "Other"; that is fine.

PASS if the answer to all three is no for every question.
FAIL if any answer is yes for any question, or if there is no JSON quiz.

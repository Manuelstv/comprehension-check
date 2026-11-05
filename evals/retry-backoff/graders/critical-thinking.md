---
type: llm
weight: 2
---
The reply ends with a JSON quiz (AskUserQuestion input) about a retry-with-backoff change to
`fetchJson`.

PASS if at least one question requires reasoning rather than recall: predicting behavior for
a concrete case (a 503 then a 200, a 404, a JSON parse error, a failure on the last attempt),
what breaks if a guard is removed, a trade-off against an alternative, or what a test would and
would not prove. AND no question is trivia (a variable name, syntax, a line count, what a
built-in is called).

FAIL if the questions can be answered by restating a summary of the change, if any question is
trivia, or if there is no JSON quiz.

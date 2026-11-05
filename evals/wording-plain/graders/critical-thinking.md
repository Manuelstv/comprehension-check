---
type: llm
weight: 2
---
The reply ends with a JSON quiz (AskUserQuestion input) about a change that makes `saveDraft`
detect a conflicting save (`If-Match` and a 412), merge the two drafts field by field and retry.

PASS if the questions make the user reason (predict an outcome, weigh a trade-off, find what a
check misses, judge a risk or decision) rather than recall, AND at least one question is about
a decision Claude made that the user did not ask for: that this tab wins when both tabs change
the same field (so that edit is still lost, silently), the limit of 3 retries and the doubling
backoff, assuming the GET always returns an ETag (`!`), or returning `conflict: true` with no
word on what the user sees.

FAIL if any question is trivia (a constant's value, a status code's name, syntax), if none
touches a decision the user did not ask for, or if there is no JSON quiz.

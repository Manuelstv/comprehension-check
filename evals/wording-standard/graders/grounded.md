---
type: llm
weight: 2
---
The reply ends with a JSON quiz (AskUserQuestion input) about this change: `saveDraft` in
`src/drafts/saveDraft.ts` now sends `If-Match` with the ETag of the version the tab loaded; on a
412 it fetches the server's draft, merges it with `mergeDrafts` (`src/drafts/merge.ts`: a field
this tab changed since it loaded wins, every other field comes from the server), and retries up
to 3 times with doubling backoff. One new test has the other tab change the title and this tab
the body.

PASS if every question is about THIS change: it names `saveDraft`, `mergeDrafts`, the
`If-Match`/ETag check, the 412 retry, the merge rule, the retry limit or the new test, or a
concrete consequence of them, so that someone who had not seen the change could not answer it
from general knowledge.

FAIL if any question is generic (e.g. "What is an ETag?", "What does HTTP 412 mean?", "Why use
exponential backoff?"), or if there is no JSON quiz.

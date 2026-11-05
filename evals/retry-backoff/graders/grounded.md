---
type: llm
weight: 2
---
The reply ends with a JSON quiz (AskUserQuestion input). The change it is about: `fetchJson`
in `src/http.ts` was made to retry network errors and 5xx responses with exponential backoff,
never 4xx, giving up after a few attempts, with an injectable delay.

PASS if every question is about THIS change: it names `fetchJson`, `src/http.ts` or a concrete
behavior of the new retry code (which statuses retry, the attempt limit, the injected delay,
what is thrown after the last attempt), so that a developer who had not seen the change could
not answer it from general knowledge.

FAIL if any question is generic (e.g. "What is exponential backoff?", "Why are retries
useful?", "What does HTTP 404 mean?"), or if there is no JSON quiz.

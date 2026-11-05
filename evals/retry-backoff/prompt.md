---
description: End to end, live prompt. A retry-with-backoff change triggers the mod, and Claude's quiz (default mixed perspective) is grounded, critical and well formed.
tags: [e2e, quiz, mixed]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Write, Edit]
append_system_prompt: "This is a non-interactive evaluation run. AskUserQuestion does not exist here and no one can answer it; do not search for it. Whenever you would call AskUserQuestion, end your turn instead with its exact input (the object with questions and metadata) as a single ```json code block, and write nothing after the block."
---

Create `src/http.ts` with exactly this content:

```ts
export type Fetcher = (url: string) => Promise<{ status: number; body: string }>

export async function fetchJson<T>(fetcher: Fetcher, url: string): Promise<T> {
  const res = await fetcher(url)
  if (res.status >= 400) throw new Error(`HTTP ${res.status} for ${url}`)
  return JSON.parse(res.body) as T
}
```

Then change `fetchJson` so it retries failed requests with exponential backoff:
retry on network errors and 5xx responses, never on 4xx, and give up after a few attempts.
Make the delay injectable so it can be tested. Keep it small; no new dependencies.

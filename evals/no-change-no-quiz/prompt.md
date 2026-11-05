---
description: End to end. A turn that only explains code, with no edit, must not quiz the user.
tags: [e2e, quiz, negative]
runs: 3
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep]
append_system_prompt: "This is a non-interactive evaluation run. AskUserQuestion does not exist here and no one can answer it; do not search for it. Whenever you would call AskUserQuestion, end your turn instead with its exact input (the object with questions and metadata) as a single ```json code block, and write nothing after the block."
---

Don't change any files. Just explain in two or three sentences what this function does and
when it would throw:

```ts
export async function fetchJson<T>(fetcher: (url: string) => Promise<{ status: number; body: string }>, url: string): Promise<T> {
  const res = await fetcher(url)
  if (res.status >= 400) throw new Error(`HTTP ${res.status} for ${url}`)
  return JSON.parse(res.body) as T
}
```

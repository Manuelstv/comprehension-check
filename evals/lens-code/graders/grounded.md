---
type: llm
weight: 2
---
The reply ends with a JSON quiz (AskUserQuestion input) about this change: `getPrice` in
`src/pricing.ts` now keeps prices in a module-level Map for 5 minutes (TTL_MS), the same
`getPrice` is used by the product page and by checkout (`priceLine`), the service runs as
several instances, and one new test checks a cache hit within 5 minutes.

PASS if every question is about THIS change: it names `getPrice`, `priceLine`, the cache, the
5-minute TTL, the new test or a concrete consequence of them, so that someone who had not seen
the change could not answer it from general knowledge.

FAIL if any question is generic (e.g. "What is a cache?", "What is a TTL?", "Why is caching
fast?"), or if there is no JSON quiz.

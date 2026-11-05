---
type: llm
weight: 3
---
The user chose the ARCHITECTURE perspective: questions about how the change fits the system.
Judge each question by its angle, not by what it mentions: a question about a test or about
checkout is fine when it is asked as a question of system design.

PASS if every question in the JSON quiz is about design and system fit: the per-instance Map
across several instances (inconsistent prices, no shared invalidation), coupling between the
product page and checkout through one `getPrice`, where the cache should live (e.g. a shared
cache or caching only for display), unbounded memory, behavior under load or a restart, how
reversible the change is, or what the tests cannot show about the running system.

FAIL if any question is a pure line-level question (what one call returns at a given time, with
no design consequence asked about) or a pure product question (who is affected, what to tell
users) with no design angle, or if there is no JSON quiz.

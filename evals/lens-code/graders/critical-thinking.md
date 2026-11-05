---
type: llm
weight: 2
---
The reply ends with a JSON quiz (AskUserQuestion input) about a 5-minute in-memory price cache
added to `getPrice`.

PASS if the questions make the user reason (predict an outcome, weigh a trade-off, find what a
check misses, judge a risk or decision) rather than recall, AND at least one question is about
a decision Claude made that the user did not ask for: the 5-minute TTL, caching in process
memory, no invalidation on price change, an unbounded Map, or letting checkout read the cache.

FAIL if any question is trivia (a variable name, syntax, a line count), if none touches a
decision the user did not ask for, or if there is no JSON quiz.

---
type: llm
weight: 3
---
The reply ends with a JSON quiz (AskUserQuestion input) about a 5-minute in-memory price cache
added to `getPrice`, with the ARCHITECTURE perspective, on a service that runs as several
instances behind a load balancer. The prompt tells Claude to look for unwanted behavior the
change brings to the system first and build at least one question on what it finds.

The change's HEADLINE trade-off is that prices can be stale for up to 5 minutes and differ
between instances, with no invalidation when a price changes. Anyone would ask about that, so
it does NOT count here.

What counts is unwanted system behavior that takes looking beyond the diff, for example:
- the Map grows with every SKU ever read and never shrinks: memory over days of traffic,
- an entry expires under load and many requests miss at once, all hitting the database,
- a restart or rolling deploy empties some instances' caches and not others, so the same SKU
  is served from the database on one and from a minutes-old entry on another,
- the database failing or slow: nothing is cached on error, so every request retries it,
- a cache inside `getPrice` silently reaching callers that never asked for caching.

PASS if at least one question puts one of these, or another real unwanted behavior that is NOT
the headline staleness, to the user as a concrete situation (traffic over days, an expiry under
load, a deploy, a database outage, another caller) and asks what the system does or which
situations go wrong. The question must not announce the problem.

FAIL if the only such questions are about the headline staleness or abstract trade-offs, if the
only such question says outright what goes wrong, or if there is no JSON quiz.

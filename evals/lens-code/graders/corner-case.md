---
type: llm
weight: 3
---
The reply ends with a JSON quiz (AskUserQuestion input) about a 5-minute in-memory price cache
added to `getPrice`, with the CODE perspective. The prompt tells Claude to hunt the added lines
for corner cases first and build at least one question on what it finds.

The change's HEADLINE trade-off is that a price can be up to 5 minutes stale (including at
checkout through `priceLine`, and differing between instances). Anyone would ask about that, so
it does NOT count here.

What counts is a corner case that only tracing the added lines reveals, for example:
- a read at exactly `TTL_MS` (`now - hit.at < TTL_MS` is false, so it misses),
- a `now` earlier than the stored `at`: the difference is negative, so the entry counts as fresh
  forever; the new test's `getPrice(db, 'A1', 0)` hits the entry the earlier test cached with
  `Date.now()`, because the module-level Map is shared across tests, so it passes for the wrong
  reason,
- a rejected `db.priceFor` (nothing is cached; the error reaches the caller, every time),
- two first reads at once (both miss and both call the database),
- a price of 0 or a missing SKU coming back from the database and being cached,
- a concrete broken `getPrice` (e.g. `<=` for `<`, never expiring) that the new test still passes.

PASS if at least one question puts one of these, or another real corner case of the added lines
that is NOT the headline staleness, to the user as a concrete input, time or situation and asks
what happens or which inputs misbehave. The question must not announce the problem.

FAIL if the only corner-case questions are about the headline staleness, if every question is
about the intended path or recall, if the only corner-case question says outright what goes
wrong, or if there is no JSON quiz.

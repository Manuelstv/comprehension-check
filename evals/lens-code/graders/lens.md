---
type: llm
weight: 3
---
The user chose the CODE perspective: questions about how the change behaves, line by line.
Judge each question by how it is ANSWERED, not by what it mentions: naming checkout, instances
or shoppers is fine when the answer comes from tracing the code.

PASS if every question in the JSON quiz is answered by tracing the changed code: a return value
or thrown error for a concrete input or time (e.g. a read at exactly 5 minutes, `now - hit.at <
TTL_MS` at the boundary, a rejected `db.priceFor`), which branch runs, what breaks if a line or
condition changes, or which broken version the new test would still let through.

FAIL if any question is answered by a design opinion (where the cache should live, which
infrastructure to use) or a user or business judgment (who should be told, whether staleness is
acceptable) rather than by tracing the code, or if there is no JSON quiz.

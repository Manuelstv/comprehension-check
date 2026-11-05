---
type: regex
pattern: '"description"\s*:\s*"[^"]{100,}"'
match: not_contains
---
No option description runs to 100 characters or more (about 12 words at most).

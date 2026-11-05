---
type: llm
focus: trace
weight: 2
---
Find the call to mcp__comprehension-check__quiz_results (the scorecard) and judge how easy its
feedback is to READ. The reader is a developer who knows TypeScript but has never seen this
codebase. Do not judge whether the verdicts are right; other graders check that.

Check each scorecard entry (punchline and explanation) and the next_step:

1. The punchline is one short line in everyday words that the reader gets on the first read.
2. The explanation stays around 40 words, in short sentences with one idea each, in active
   voice. Splitting the why into two or three short sentences is fine.
3. Any technical term it needs is explained in a few words. Code names in backticks such as
   `TTL_MS` are fine.
4. No double negatives, and no run of three or more unexplained technical terms.
5. next_step is one plain, concrete action that is not a sentence you must read twice.

Judge the wording, not whether the verdicts are right.
PASS if at most one entry (or the next_step) fails a check.
FAIL if two or more fail, or if the scorecard tool was not called. When failing, quote the
hardest sentence to read.

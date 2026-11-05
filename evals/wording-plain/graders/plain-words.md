---
type: llm
weight: 3
---
Look only at the JSON quiz (AskUserQuestion input) at the end of the reply. Judge how easy it is
to READ, not how hard it is to answer. The reader is a developer who knows TypeScript but has
never seen this codebase.

For each question and its options, check:

1. The reader understands what is asked on the first read, without going back over it.
2. Every sentence is short (about 15 words) and holds one idea, with a clear subject doing
   something (active voice). A question may set the scene in a few such sentences before it asks;
   that is fine, as long as the whole question stays around 40 words and asks ONE thing (not
   "what happens, and why?"). Every number says what it is (a price, a time, a count).
3. There are no double negatives, no "Which of the following statements is true" wrapper, and
   no run of three or more technical terms left unexplained. Code names in backticks such as
   `getPrice` or `TTL_MS` are fine where the question needs them.
4. Each option label names its idea in 1-4 words, and each description gives a short reason in
   everyday words: a technical term, status code or header in an option is explained in that
   question, since each question is shown on its own.
5. A question whose twist is a negation word ("does not prove", "is not true") writes NOT in
   capitals. A question with no negation word (e.g. "which bug would the test still let
   through?") needs no capitals.

Judge the wording, not the reasoning. A scenario with several steps (three tabs, two retries)
is fine when each step is its own short sentence: tracking the steps is the thinking the quiz
asks for.

Count the questions that fail any check.
PASS if at most one question fails a check.
FAIL if two or more questions fail a check, or if there is no JSON quiz. When failing, quote the
hardest sentence to read.

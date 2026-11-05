---
type: llm
focus: trace
weight: 2
---
Find the call to mcp__comprehension-check__quiz_results (the scorecard) and judge its input.

The user's answers: Q1 picked "12" (right). Q2 picked only "Expiry" (the test also misses
Checkout and Instances). Q3 wrote in casual words that shoppers can be charged the old price at
checkout for up to 5 minutes because checkout uses getPrice too (right idea). Q4 picked "Per
instance" but said the Map is shared by every instance through the database (wrong reason).

PASS if all of these hold:
- the Q2 entry names what the user missed (checkout and/or instances);
- the Q3 entry does not penalise the casual wording;
- the Q4 entry corrects the stated reason: the Map lives in each process's memory and is not
  shared through the database;
- each explanation ties the why to the code (TTL_MS, the `<` comparison, `priceLine`, the
  module-level Map), not generic caching advice;
- next_step is one concrete action (a test to add, a line to read, an input to try), not
  "review the code".

FAIL otherwise, or if the scorecard tool was not called.

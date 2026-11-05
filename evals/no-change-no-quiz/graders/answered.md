---
type: llm
---
PASS if the reply explains that the function fetches the URL, throws for HTTP status 400 or
above, and can also throw when the body is not valid JSON (or when the fetcher itself rejects).
FAIL if it quizzes the user or does not answer the question.

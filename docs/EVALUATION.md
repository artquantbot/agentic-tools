# Release evaluation

Run `npm run evaluate` to reproduce the baseline against the committed snapshot. The 33-case set has 26 labeled relevance queries, six expected abstentions and one retired-candidate policy case. At least one expected project appeared in the first three results in all 26 labeled relevance cases. The system abstained on all six expected cases. Among 115 recommendations returned after quarantining Registry leads, zero violated a recognized hard constraint and zero had an archived or publisher-deprecated status. The archived Browserbase MCP repository appeared as a review candidate for the hosted-browser request.

These queries are a maintained development baseline. An independent holdout, broader corpus relevance judgments and realized integration outcomes remain unmeasured.

The release ran 10 Node tests across catalog and schema, ingestion safety, ranking, the REST contract and the official MCP SDK. Six Playwright cases passed against the production build with desktop and mobile Chromium profiles. They exercise search, filters, comparison, detail provenance, categories, stack and developer access, plus automated axe checks for sampled pages and both themes. The automated checks cover tested routes and states.

# Review Thread Gate

`scripts/check-review-threads.mjs` reads pull request review threads through GitHub GraphQL and
blocks unresolved, non-outdated actionable threads.

The workflow writes `review-thread-summary.json` and uploads it as an artifact. Label updates are
intentionally not required for the gate to function.

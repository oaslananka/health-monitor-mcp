# Failure Classifier

`scripts/classify-gh-failure.mjs` classifies failed CI logs into common release and security
failure buckets. It returns JSON with:

- `classification`
- `root_cause`
- `recommended_fix`
- `auto_fix_allowed`
- `human_approval_required`
- `publish_must_stop`

Use it on failed workflow logs before retrying a fix.

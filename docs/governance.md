# Governance

GitHub Issues are the source of truth for planned work. Pull requests must link to an issue unless
the change is a maintainer-only release, dependency, or repository administration update.

## Intake

- Bug reports, feature requests, release blockers, and documentation or governance gaps use the
  forms in `.github/ISSUE_TEMPLATE/`.
- Questions and exploratory support belong in GitHub Discussions.
- Security vulnerabilities use the private path in `SECURITY.md`.
- Blank issues are disabled for contributors so maintainers receive structured reports.

## Label Taxonomy

Each actionable issue should have one priority label, at least one area label, one type label, and
one risk label.

| Axis        | Labels                                                                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Priority    | `priority:P0`, `priority:P1`, `priority:P2`, `priority:P3`                                                                                                  |
| Area        | `area:ci`, `area:compatibility`, `area:docs`, `area:dx`, `area:governance`, `area:infra`, `area:packaging`, `area:release`, `area:security`, `area:testing` |
| Type        | `type:bug`, `type:docs`, `type:enhancement`, `type:security`, `type:task`                                                                                   |
| Risk        | `risk:high`, `risk:medium`, `risk:low`                                                                                                                      |
| Status      | `status:in-progress`, `agent:blocked`                                                                                                                       |
| Review size | `size/XS`, `size/S`, `size/M`, `size/L`                                                                                                                     |

Standard GitHub labels such as `duplicate`, `good first issue`, `help wanted`, `invalid`,
`question`, and `wontfix` can be added when they clarify triage.

## Priority And SLA

| Priority      | Use For                                                                      | First Response Target             |
| ------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| `priority:P0` | Security, release, public install, required CI, or package artifact blockers | 1 business day                    |
| `priority:P1` | Major compatibility, product, or governance gaps                             | 3 business days                   |
| `priority:P2` | Quality, testing, DX, or maintainability improvements                        | 7 business days                   |
| `priority:P3` | Polish, demos, community improvements, or future roadmap ideas               | Best effort during backlog review |

Response targets start after enough information is present to reproduce, validate, or scope the
request. Security reports follow the timeline in `SECURITY.md` when that policy is stricter.

## Triage Workflow

1. Confirm the issue is not a duplicate.
2. Add or normalize priority, area, type, and risk labels.
3. Add `agent:blocked` only when the next action depends on an external credential, account
   setting, approval, or service state that the agent cannot complete.
4. Add `status:in-progress` when work starts, and remove it when the issue is closed or blocked.
5. Keep acceptance evidence in the linked PR or in an issue comment before closing.

## Stale Policy

This repository does not auto-close stale issues. Maintainers review the backlog at least monthly
and close issues only as resolved, duplicate, invalid, or `wontfix`. Issues that are still valid but
waiting on an external dependency remain open with `agent:blocked`.

## Pull Requests

PRs should use `.github/pull_request_template.md`, include validation output, and keep scope tied
to one issue. Required checks are expected to pass before merge. Release and workflow changes need
artifact, CI, or run evidence in the PR or issue thread.

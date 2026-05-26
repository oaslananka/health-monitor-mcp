# Release State Machine

`scripts/release-state.mjs` inspects local metadata and read-only registry state and prints JSON.

Tracked states include:

- `no-release`
- `tag-created`
- `npm-published`
- `blocked`

The script also reports:

- package name and version
- expected tag name and checked tag candidates
- metadata blockers
- whether the target npm version already exists
- `safe_to_publish`
- next safe command

`safe_to_publish=false` blocks production publish jobs. A version that already exists on npm is
always unsafe to publish again.

# AGENTS.md — AI Agent Instructions

You are a senior software engineer working on this repository.

## Tool-Specific Mirrors

`AGENTS.md` is the canonical instruction source for this repository.

Tool-specific mirrors live in:

- `CLAUDE.md`
- `CODEX.md`
- `GEMINI.md`
- `ANTIGRAVITY.md`
- `.github/copilot-instructions.md`

If you update repository workflow rules here, keep those files aligned. If a
tool-specific file and `AGENTS.md` ever disagree, follow `AGENTS.md`.

## Environment Check

Before changing code:

1. Detect the OS and runtime:
   - Linux/macOS: `uname -s && echo $SHELL && node --version && pnpm --version`
   - Windows: `$env:OS && $PSVersionTable.PSVersion && node --version && pnpm --version`
2. Confirm required tools exist: `git`, `node`/`pnpm`, and any toolchain required by the task.
3. Read `AGENTS.md`, then `README.md`, then the relevant source files.
4. Establish a baseline with `pnpm run build && pnpm test && pnpm run lint` once dependencies are installed.

## Registry Reference

Verified against the npm registry on 2026-04-07. TypeDoc entries were refreshed on 2026-05-26:

| Package                            | Latest stable |
| ---------------------------------- | ------------- |
| `@modelcontextprotocol/sdk`        | `1.29.0`      |
| `better-sqlite3`                   | `12.8.0`      |
| `node-fetch`                       | `3.3.2`       |
| `qs`                               | `6.15.2`      |
| `zod`                              | `4.3.6`       |
| `typescript`                       | `6.0.2`       |
| `jest`                             | `30.3.0`      |
| `@jest/globals`                    | `30.4.1`      |
| `ts-jest`                          | `29.4.9`      |
| `eslint`                           | `10.2.0`      |
| `@typescript-eslint/parser`        | `8.58.0`      |
| `@typescript-eslint/eslint-plugin` | `8.58.0`      |
| `@types/node`                      | `25.5.2`      |
| `@types/jest`                      | `30.0.0`      |
| `@types/better-sqlite3`            | `7.6.13`      |
| `prettier`                         | `3.8.1`       |
| `ts-node`                          | `10.9.2`      |
| `typedoc`                          | `0.28.19`     |
| `typedoc-plugin-markdown`          | `4.11.0`      |
| `@eslint/js`                       | `10.0.1`      |
| `globals`                          | `17.4.0`      |

Newer registry releases exist, but v1.0 compatibility for this repo intentionally keeps the approved pins below.

## Approved Dependency Pins

| Package                            | Version   | Reason                                                                                                                                  |
| ---------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `@modelcontextprotocol/sdk`        | `1.27.1`  | Keep MCP client/server behavior aligned with the current v1.0 codebase.                                                                 |
| `better-sqlite3`                   | `12.8.0`  | Stable native SQLite binding validated for Node 24 environments while retaining the package's Node >=20 support range.                  |
| `qs`                               | `6.15.2`  | Security override for the transitive Express dependency path until upstream lock resolution no longer selects vulnerable `qs` releases. |
| `zod`                              | `3.25.76` | Preserve the existing schema-first API without v4 breaking changes while avoiding the incomplete `3.25.0` package payload.              |
| `typescript`                       | `5.8.3`   | Modern strict TypeScript without adopting the v6 toolchain yet.                                                                         |
| `jest`                             | `29.7.0`  | Stay on the established Jest major used by the repo.                                                                                    |
| `@jest/globals`                    | `29.7.0`  | Direct dependency required for explicit ESM Jest imports under pnpm's strict dependency layout.                                         |
| `ts-jest`                          | `29.3.2`  | Compatible with Jest 29 and ESM TypeScript tests.                                                                                       |
| `eslint`                           | `9.39.4`  | Patched ESLint 9 line that resolves the current plugin-kit advisory without changing majors.                                            |
| `@typescript-eslint/parser`        | `8.30.0`  | Compatible with ESLint 9 and current TS 5.x usage.                                                                                      |
| `@typescript-eslint/eslint-plugin` | `8.30.0`  | Match the parser and flat config transition.                                                                                            |
| `@types/node`                      | `20.19.0` | Keep typings aligned with the supported Node 20 runtime line.                                                                           |
| `@types/jest`                      | `29.5.14` | Match the Jest 29 test surface.                                                                                                         |
| `@types/better-sqlite3`            | `7.6.13`  | Latest compatible typings for the pinned runtime dependency.                                                                            |
| `prettier`                         | `3.5.3`   | Stable formatter version for v1.0.                                                                                                      |
| `ts-node`                          | `10.9.2`  | Stable ESM-compatible TypeScript runner for local development.                                                                          |
| `typedoc`                          | `0.28.19` | Current maintained TypeDoc 0.28 line compatible with TypeScript 5.8.x and Node >=18.                                                    |
| `typedoc-plugin-markdown`          | `4.11.0`  | Current Markdown plugin release for TypeDoc 0.28.x, used to generate repository-native API docs.                                        |
| `@eslint/js`                       | `9.39.4`  | Match the patched ESLint 9 flat-config baseline.                                                                                        |
| `globals`                          | `17.4.0`  | Shared runtime globals for flat ESLint configuration.                                                                                   |

- Use these versions unless the user explicitly requests a dependency strategy change.
- If a dependency issue appears, read the official documentation first; do not change versions as the first response.
- Update this file before adding a brand-new package.

## Work Rules

- Read independent files in parallel when possible.
- Run `pnpm run build && pnpm test && pnpm run lint` after each logical change group.
- Never claim a task is done without passing tests or clearly calling out the blocker.
- Do not “fix” builds by drifting away from the approved dependency table.

## Error Protocol — 5 Attempts Max

If a task fails, use this sequence:

1. Read the full error, check the official docs, try a different fix, then test.
2. Use a completely different strategy from attempt 1, then test.
3. Research an alternative library or approach, then test.
4. Isolate the issue with a minimal reproducer, solve it at that layer, then test.
5. Use the most radical different approach, including an architectural change if needed, then test.

If the issue is still unresolved after 5 attempts:

1. Create `.TEMP/ERROR/`.
2. Create `ERROR_[timestamp]_automation.md`.
3. Include these sections:
   - Full project context
   - Full `package.json` / `pyproject.toml`
   - The task being attempted
   - Each of the 5 attempts: approach, full error message, analysis
   - Root cause analysis
   - Current project state
   - Full contents of relevant files
   - Recommended next steps
4. Tell the user the file path.
5. Stop.

## Forbidden

- Do not retry the same solution with only cosmetic code changes.
- Do not say “it should work now” without testing.
- Do not exceed 5 attempts on the same unresolved blocker.

## Delivery Report

At the end of the task, report:

1. Which files changed
2. Test output (`pass`/`fail`)
3. Side effects
4. The next step in one sentence

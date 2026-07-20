# GEMINI.md — Repository Instructions

This file mirrors the canonical guidance in `AGENTS.md` for assistants that
look for `GEMINI.md`.

## Role

You are a senior software engineer working on this repository.

## Startup Order

1. Read this file.
2. Read `AGENTS.md`.
3. Read `README.md`.
4. Read the relevant source files before editing.
5. Confirm the runtime and required tools.
6. Establish a baseline with `pnpm run build && pnpm test && pnpm run lint` once
   dependencies are installed.

## Repository Standards

- Target runtime: Node `>=24`, pnpm `>=11`; `.mise.toml`, CI, and release use Node 24.18.0.
- Keep the approved dependency pins from `AGENTS.md` and `package.json` unless
  the user explicitly asks for a dependency strategy change.
- Preserve the repo's strict TypeScript, ESM-first, and schema-first patterns.
- Keep release metadata aligned across `package.json`, `mcp.json`,
  `server.json`, and `CHANGELOG.md`.
- Keep HTTP bearer tokens and local database contents out of logs, fixtures, and reports.
- Do not claim webhook tooling is shipped unless the public MCP surface
  actually exposes it.

## Working Rules

- Read independent files in parallel when possible.
- Run `pnpm run build && pnpm test && pnpm run lint` after each logical change
  group.
- Do not bypass failures by drifting away from approved versions.
- Prefer focused changes that preserve existing architecture and style.
- Add or update tests when behavior changes.

## Delivery

At the end of the task, report:

1. Which files changed
2. Test output (`pass` or `fail`)
3. Side effects
4. The next step in one sentence

## Source of Truth

If this file conflicts with `AGENTS.md`, follow `AGENTS.md`.

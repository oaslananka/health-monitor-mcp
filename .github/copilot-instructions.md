# GitHub Copilot Instructions

Use `AGENTS.md` as the canonical repository guide. This file exists so GitHub
Copilot suggestions stay aligned with the repo workflow and release standards.

## Expectations

- Read `README.md` and the relevant source files before suggesting changes.
- Preserve the repo's current architecture and coding style.
- Respect the approved dependency pins from `AGENTS.md` and `package.json`.
- Prefer the existing TypeScript, ESM-first, Zod-first, and strict-mode
  patterns already used in `src/`.
- Keep versioned release metadata aligned across `package.json`, `mcp.json`,
  `server.json`, and `CHANGELOG.md` when release work is requested.
- Keep security documentation accurate: PAT storage is encrypted unless explicit
  local insecure mode is documented and enabled.
- Do not suggest public webhook support unless the actual MCP tools expose it.

## Validation

After each logical change group, prefer running:

```bash
pnpm run build && pnpm test && pnpm run lint
```

If behavior changes, add or update tests.

## Output Quality

- Prefer small, reviewable changes.
- Do not fix build or audit issues by changing dependency strategy unless that
  is explicitly requested.
- If this file conflicts with `AGENTS.md`, follow `AGENTS.md`.

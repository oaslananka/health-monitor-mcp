# Architecture

## Module Map

```text
src/
├── mcp.ts            # stdio entrypoint
├── server-http.ts    # native HTTP entrypoint
├── app.ts            # MCP tool registration and formatting
├── checker.ts        # live MCP probes with retry/backoff
├── registry.ts       # DB read/write access
├── db.ts             # SQLite connection bootstrap
├── migrations.ts     # schema versioning
├── alerts.ts         # threshold evaluation
├── azure-devops.ts   # Azure DevOps REST client
├── scheduler.ts      # optional background check loop
├── retry.ts          # exponential retry helper
├── logging.ts        # structured logger
├── webhooks.ts       # v1.1 placeholder, not shipped as a public tool in v1.0.x
└── version.ts        # package version resolution
```

## Data Flow

```text
User prompt
  -> MCP tool handler (app.ts)
  -> checker.ts or azure-devops.ts
  -> registry.ts persists records
  -> alerts.ts evaluates thresholds
  -> JSON or Markdown response returns to the client
```

## Runtime Modes

- `src/mcp.ts`: stdio server for local MCP clients and `npx` usage
- `src/server-http.ts`: HTTP server exposing authenticated `POST /mcp` and public `GET /health`
- `src/policy.ts`: runtime profile policy for stdio execution in local and remote-safe modes
- `src/scheduler.ts`: opt-in loop enabled with `HEALTH_MONITOR_AUTO_CHECK=1`

## Storage

- SQLite database with WAL mode for file-backed databases
- Automatic schema migrations via `schema_migrations`
- Health history stored in `health_checks`
- Azure pipeline definitions stored in `azure_pipelines`

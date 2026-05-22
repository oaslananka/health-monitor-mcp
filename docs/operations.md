# Operations

## HTTP Deployment

The HTTP server defaults to `HOST=127.0.0.1`. Non-loopback bind addresses require:

```bash
HEALTH_MONITOR_PROFILE=remote-safe
HEALTH_MONITOR_HTTP_TOKEN=...
```

Use `chatgpt` or `claude` profiles only for remote connector experiments. They inherit the
remote-safe restrictions and keep raw `stdio` execution disabled.

## Credential Storage

Set `HEALTH_MONITOR_ENCRYPTION_KEY` before registering Azure DevOps pipeline groups. Store the key
outside the repository. The monitor never prints decrypted PAT values.

## Retention And Concurrency

- `HEALTH_MONITOR_RETENTION_DAYS` defaults to `30`.
- `HEALTH_MONITOR_MAX_CONCURRENCY` defaults to `5`.
- `HEALTH_MONITOR_HTTP_TIMEOUT_MS` defaults to `10000`.
- `HEALTH_MONITOR_AZURE_TIMEOUT_MS` defaults to `10000`.
- `HEALTH_MONITOR_WEBHOOK_TIMEOUT_MS` defaults to `5000`.

## Docker

The runtime image runs as the non-root `node` user and uses `HOST=127.0.0.1` by default. For remote
HTTP service deployment, set `HOST=0.0.0.0`, `HEALTH_MONITOR_PROFILE=remote-safe`, and
`HEALTH_MONITOR_HTTP_TOKEN`.

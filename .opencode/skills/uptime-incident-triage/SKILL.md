---
name: uptime-incident-triage
description: Incident triage workflow for health-monitor-mcp using MCP server checks, dashboards, uptime evidence, and reports.
---

# Uptime Incident Triage Skill

Use this skill when an MCP server or monitored service may be unhealthy.

## Workflow

1. Identify the affected registered server and expected transport.
2. Run `check_server` for the narrowest live signal.
3. Use `get_uptime` to distinguish a new failure from recurring instability.
4. Review `get_dashboard` or `get_report` when multiple targets may be affected.
5. Classify impact as down, degraded, flaky, recovered, or unknown.
6. Report evidence, likely owner action, and the next verification step.

## Error Handling

Inspect stable `error.code` and `error.remediation` fields. Register missing targets before retrying, and do not enable local stdio unless the target and executable are trusted.

## Safety

Health inspection is read-only. Do not modify registrations or alert thresholds without explicit approval.

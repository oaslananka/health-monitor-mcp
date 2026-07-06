---
name: uptime-incident-triage
description: Incident triage workflow for health-monitor-mcp, including server checks, pipeline status, dashboard review, uptime evidence, and report generation.
---

# Uptime Incident Triage Skill

Use this skill when a service, MCP server, or CI pipeline may be unhealthy.

## Workflow

1. Define the affected service or pipeline.
2. Run the narrowest relevant health check first.
3. Pull logs or status evidence only as needed.
4. Classify impact as down, degraded, flaky, recovered, or unknown.
5. Recommend owner action and follow-up checks.

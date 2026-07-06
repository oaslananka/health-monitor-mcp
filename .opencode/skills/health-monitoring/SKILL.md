---
name: health-monitoring
description: Health/status monitoring workflow for health-monitor-mcp covering MCP server registration, checks, dashboards, uptime, and reports.
---

# Health Monitoring Skill

Use this skill when an agent needs to monitor or inspect service health through `health-monitor-mcp`.

## Workflow

1. Register or confirm the monitored server target.
2. Run a single-target health check or all-target check depending on scope.
3. Review dashboard, report, and uptime evidence.
4. Check monitor statistics when the monitor itself may be unhealthy.
5. Report status, evidence, impact, and next action.

## Safety

Health checks are observation by default. Do not change registrations or alert settings without explicit approval.

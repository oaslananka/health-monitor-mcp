---
name: alerting-dashboard
description: Alert and dashboard workflow for health-monitor-mcp covering MCP target registration, threshold review, dashboards, and monitoring hygiene.
---

# Alerting Dashboard Skill

Use this skill when configuring or reviewing MCP health dashboards and alert policy.

## Workflow

1. Identify the MCP servers that should be monitored and why.
2. Confirm each target name, transport, URL or local executable, and tags before registration.
3. Configure alert thresholds only after explicit approval.
4. Run `check_all` and review `get_dashboard` for current health and alert findings.
5. Use `get_report` for a shareable evidence summary.
6. Document owners, thresholds, expected latency, and known monitoring gaps.

## Safety

- Prefer Streamable HTTP for remote targets.
- Treat SSE as legacy compatibility.
- Enable stdio only for trusted local executables.
- Do not change registrations or thresholds without explicit approval.

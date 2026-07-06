# Agent Runtime Configuration

This document gives copyable configuration examples for running `health-monitor-mcp` from popular MCP-capable agent runtimes.

## Claude Code

```bash
claude plugin validate .
claude --plugin-dir .
```

## Codex CLI

Copy `.codex/config.example.toml` into your Codex config.

## VS Code / GitHub Copilot

Use `.vscode/mcp.example.json` as a workspace MCP configuration example.

## OpenCode

Copy `opencode.example.jsonc` to `opencode.json`, or merge the `mcp` block into an existing OpenCode config. OpenCode skills are mirrored under `.opencode/skills/`.

## Generic MCP clients

```bash
npx health-monitor-mcp
```

## Safety

`health-monitor-mcp` can change monitoring registrations and alert settings. Require explicit approval before modifying monitored targets or thresholds.

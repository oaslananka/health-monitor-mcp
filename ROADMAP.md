# Roadmap

## v1.1.0 - Webhook and Alerting

- [ ] Wire webhook delivery into alert execution paths
- [ ] Add `set_webhook` and `remove_webhook` MCP tools
- [ ] Deduplicate repeated alert deliveries for the same incident window

## v1.2.0 - Multi-Provider Monitoring

- [ ] Add GitHub Actions workflow status monitoring
- [ ] Add GitLab CI/CD pipeline monitoring
- [ ] Add generic HTTP health checks for non-MCP endpoints

## v2.0.0 - Credential Hardening

- [x] Encrypt Azure DevOps PAT storage with `HEALTH_MONITOR_ENCRYPTION_KEY`
- [ ] Add multi-user support for shared monitoring deployments
- [ ] Harden secret-management flows for future webhook and provider credentials

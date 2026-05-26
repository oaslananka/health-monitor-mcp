# Architecture Decision Records

ADRs capture decisions that affect compatibility, security, release behavior, or long-term
maintenance. New ADRs should use the same sections as the records below: status, context,
decision, consequences, and validation.

| ADR                                               | Decision                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| [0001](0001-runtime-transport-policy.md)          | Keep stdio local by default and require explicit remote-safe HTTP policy |
| [0002](0002-encrypted-pat-storage.md)             | Encrypt Azure DevOps PATs before writing them to SQLite                  |
| [0003](0003-sqlite-local-state.md)                | Use local SQLite with migrations for monitor state                       |
| [0004](0004-release-and-supply-chain-evidence.md) | Release through GitHub workflows with supply-chain evidence              |

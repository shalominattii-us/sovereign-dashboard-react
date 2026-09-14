# Agent Guidance

This repo is part of the shalominattii-us Sovereign stack and is worked on
by autonomous agents (human-authorized, per the Overwatch protocol).

## Conventions

- **ΩSOVEREIGN MAPPINGΩ status marks:** Ω = pre/planned, ΩΩ = set/in-progress, ΩΩΩ = post/complete. Use them in status tables.
- **A2D standard:** anything user-facing ships Add-to-Desktop, Auto-start-on-boot, Deploy-as-service.
- **BUNDLEMIT:** bundle + commit + push as one operation.
- **Secrets:** never commit keys, tokens, wallet material, or .env files. Scan before push. `.env.example` templates only, with placeholder values.
- **Ingestion rule:** only build/code that maps to the sovereign agentic system belongs here. No personal material, no legal/government-process material.

## Working here

1. Read README.md first — it carries the canonical architecture for this module.
2. Keep commits atomic and messages imperative.
3. If a script carries a smoke-test harness, run it before committing changes to that script.

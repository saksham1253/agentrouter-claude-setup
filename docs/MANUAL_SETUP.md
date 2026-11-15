# Manual setup and existing installations

Automated provisioning is deliberately pinned to Windows/cc-switch4.0.25/schema24. Use this route for newer versions, custom profiles, Stack mode or existing active routing instead of bypassing guards.

1. Back up cc-switch using its built-in export/backup function. Keep the backup private: it can contain provider keys. Record current client settings and selected direct provider.
2. In cc-switch create **one Claude Code provider** using the recipient's own AgentRouter key and correct HTTPS base URL. Choose **OpenAI Responses**.
3. Set default and Opus/Haiku models to `gpt-6.1-sol`, Sonnet to `gpt-6-astra`. Confirm actual available IDs. Use client family aliases `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-5-5`; don't assume a raw unknown client ID survives model mapping.
4. Where supported, select client reasoning passthrough (`claudeReasoningEffort: passthrough`). Do not add a static `reasoning.effort` body override if the client should control effort.
5. Enable Claude Code local routing at loopback15721. Keep a separate AR-Proxy loopback15720. If your existing bridge port differs, use that actual port consistently.
6. Run `bun proxy/proxy.ts --port 15720 --upstream http://127.0.0.1:15721 --big-ctx-concurrency 3 --queue-timeout 60000 --compact-at-tokens 0 --omit-bridge-reasoning` in this trusted repo. Proxy stays in that foreground shell; see source launcher for detached use.
7. Back up and merge Claude client `env.ANTHROPIC_BASE_URL=http://127.0.0.1:15720` and `ANTHROPIC_AUTH_TOKEN=PROXY_MANAGED`; real credential stays in cc-switch. Preserve other settings. Ensure no conflicting `ANTHROPIC_API_KEY` takes priority.
8. Pin15720 in your workspace's `.claude/settings.local.json` environment too, because cc-switch may set global routing back to15721. Merge, don't replace permission arrays or user work.
9. Set `autoCompactEnabled:true`, supported `autoCompactWindow`500000 or1000000; update only existing per-model window overrides when choosing a uniform threshold. Do not add unknown1.5M values or context-limit workarounds.
10. Reopen the VS Code panel and inspect effective routing/selection. Use local health first. Only after quota approval perform a short genuine-client/tool-read test.

macOS/Linux: install official Bun, native Claude Code and cc-switch appropriate for your OS; manually configure equivalent route and auth. Do not run Windows provisioning/PowerShell scripts. Bash launcher and proxy regression suite are available, but a full macOS/Linux installer is not shipped.

## Existing routing or failed attachment

Quit cc-switch cleanly before using the automatic provisioner. If `attached`, `pending`, residual contract or PROXY_MANAGED residue remains, let cc-switch recover/disable routing normally. Do not delete live-state or stamp `attached:false` while the app is running. Closing its window often only hides it to the tray.

Automatic configuration also requires Claude Code processes closed. From inside a running Claude Code assistant, prepare the command and have the user run it after closing that session; don't defeat the safety check.

## Key rotation

Open the one toolkit-owned AgentRouter provider, edit its credential and save. The key is read for later requests; changing it doesn't affect a request already in flight. No proxy restart normally needed solely for a saved credential change. Never use a different local proxy's key as the AgentRouter credential.

# AgentRouter + Claude Code setup toolkit

A Windows-first, source-visible setup kit for **Claude Code -> AR-Proxy -> cc-switch -> AgentRouter OpenAI Responses**.

This repository includes the tested local AR-Proxy extensions, an additive configuration installer, a dependency bootstrap, service/CLI launchers, diagnostics, restore guards, and a detailed prompt another coding assistant can follow.

**Start here:** [AI setup prompt](SETUP_PROMPT.md). Copy its instructions into a trusted local coding assistant, or follow the manual steps below. No API key is shipped.

```text
Claude Code / VS Code panel
        |
        v
http://127.0.0.1:15720  AR-Proxy
        |
        v
http://127.0.0.1:15721  cc-switch
        |
        v
AgentRouter /v1/responses
```

## What is included

| Component | Purpose |
|---|---|
| [proxy/](proxy/) | AR-Proxy source, launcher, probes and local regression tests |
| [scripts/bootstrap.ps1](scripts/bootstrap.ps1) | Check/install official prerequisites and checksum-verify portable cc-switch |
| [scripts/configure.ts](scripts/configure.ts) | Preview first; then back up and add one toolkit-owned Responses provider |
| [scripts/start.ts](scripts/start.ts) | Start configured services; optionally launch the native Claude CLI |
| [scripts/doctor.ts](scripts/doctor.ts) | Read-only configuration/listener diagnostics; no paid model calls |
| [scripts/restore.ts](scripts/restore.ts) | Restore only if files/database still match the setup receipt |
| [SETUP_PROMPT.md](SETUP_PROMPT.md) | Complete local-assistant installation and verification instructions |
| [docs/](docs/) | Routing, troubleshooting, security and key-rotation guidance |

### Model selectors

One provider exposes two routing families:

- `claude-opus-5` -> **gpt-6.1-sol**
- `claude-sonnet-5` -> **gpt-6-astra**
- Haiku/background selector -> **gpt-6.1-sol**

These are client routing selectors, not claims that AgentRouter serves actual Claude weights. The recipient must verify current model access and exact IDs. Availability, prices, context capacity and supported effort belong to the provider.

### Reasoning and compaction

- cc-switch metadata uses `apiFormat: openai_responses` and `claudeReasoningEffort: passthrough`.
- Active thinking plus the client's selected effort is translated request-by-request; no fixed maximum or global effort environment pin is added.
- Same-model Ultracode agents can inherit session effort; explicit per-agent effort remains independent. Ultracode is orchestration, not a provider reasoning level.
- Native auto-compaction stays **on**: safe profile **500k**, replica profile **1M**. Values must be 100,000–1,000,000 and are capped by the client's effective model window. **1.5M is not supported.** A saved threshold does not increase upstream capacity.
- Proxy history summarization is **off**. The opt-in source remains available for inspection, but is not silently enabled by setup.

### Proxy extensions

- Selected transient HTTP/SSE retry handling.
- Bounded recovery from empty cc-switch reasoning-prefix stream truncation, before visible text/tools.
- Recognized Azure foreign-resource reasoning-state compatibility filtering.
- Three large-request permits; independent 60-second queue admission budget; existing bounded retry/upstream timeouts.
- Visible text/tool history and exact numeric values preserved where rewriting is supported. No saved transcript edits.

These are bounded mitigations, not a promise of unlimited context, perfect output, fast provider responses or zero failures. Read [troubleshooting](docs/TROUBLESHOOTING.md).

## Quick setup — Windows

Requirements: Windows 10/11, PowerShell, **Bun 1.4.4+**, native **Claude Code 2.1.293+**, and **cc-switch 4.0.25 / schema 24**. The automated provisioner intentionally refuses unknown versions. Existing newer cc-switch installations should use manual configuration, not a downgrade.

1. Clone this repository into a fresh folder. Read the source before running it.
2. Check/install prerequisites:
   ```powershell
   .\scripts\bootstrap.ps1 -InstallPrerequisites -OpenBridge
   ```
   Uses official WinGet packages and the pinned official cc-switch release. It does not overwrite an existing cc-switch directory or automatically answer onboarding/trust prompts.
3. **First-run initialization:** let cc-switch initialize and import the existing Claude provider. Then **Quit from its tray**, not just close the window. Close Claude Code chats/CLI before configuration. The installer will refuse a running app or unresolved attachment.
4. Preview:
   ```powershell
   bun .\scripts\configure.ts --profile safe
   ```
5. Put your own AgentRouter key in a **small private file outside this repository**, with no quotes/newline. Do not paste it into the assistant or commit it.
6. Apply with backups and a project route pin:
   ```powershell
   bun .\scripts\configure.ts --apply --profile safe --key-file C:\private\agentrouter-key.txt --workspace C:\projects\your-project
   ```
   Specify `--cc-switch-exe` if not under your profile's `cc-switch/cc-switch.exe`. `--endpoint` accepts an HTTPS provider base URL, not a full `/responses` endpoint. cc-switch recognizes a trailing `/v1`; check the actual provider convention.
7. Open cc-switch and answer any legitimate onboarding/routing prompts. Then:
   ```powershell
   bun .\scripts\start.ts --services-only
   bun .\scripts\doctor.ts
   ```
8. Reopen the **VS Code Claude panel** in the pinned project. Select GPT-6.1 Sol or GPT-6 Astra. You do **not** need a separate terminal work chat; `--services-only` only starts the route.

For terminal Claude Code instead:
```powershell
bun .\scripts\start.ts
bun .\scripts\start.ts --model claude-sonnet-5
```

### Optional replica profile

To match the broad shell/workflow/web permissions and 1M window used in the reference setup:

```powershell
bun .\scripts\configure.ts --apply --profile replica --allow-broad-tools --key-file C:\private\agentrouter-key.txt --workspace C:\projects\your-project
```

**Explicit consent required:** this adds unrestricted `Bash`, `Workflow`, `WebFetch`, `WebSearch` allow rules. Bash can execute arbitrary shell commands. Existing deny/ask rules and security checks survive; `bypassPermissions`, disabled web security preflight and managed-policy overrides are never added. Replica supplies `xhigh` only where a model has no saved effort. It does not silently enable standing Ultracode, which can materially increase token use.

The safe profile preserves permission rules and current effort. Both profiles preserve other providers, hooks, unrelated environment variables, current model choices and existing custom picker rows. Routing/auth fields change intentionally; previous credentials remain in the local backup.

## Backups, reruns and restoration

Backups live under your profile's `.agentrouter-setup/backups/`. They contain credentials and must remain private. The installer uses a consistent serialized SQLite snapshot and a write-ahead receipt for database/file stages. Reruns update only the toolkit-owned provider; foreign ID collisions fail closed.

```powershell
bun .\scripts\restore.ts --backup C:\Users\YOUR_USER\.agentrouter-setup\backups\BACKUP_DIRECTORY
```

Close Claude Code and Quit cc-switch first. Restore refuses changed files/database rather than discard newer work. After the app has started or user settings changed, a whole-database restore may be refused: use cc-switch's normal routing controls or inspect the backup manually. There is no claim of a race-free app-wide lock over an external desktop app.

## Verification

```powershell
bun test
bun .\scripts\scan-public.ts
```

Tests use disposable local databases and synthetic HTTP fixtures. They do not spend API quota or read private chats. Doctor verifies configuration and local listeners, not model quality or backend capacity. A real inference/tool-use test requires the recipient's explicit approval because it uses their quota.

## Platforms and limitations

Proxy tests/source are portable. **Automated cc-switch provisioning/bootstrap is Windows-only.** macOS/Linux users can manually configure the same route using [manual setup](docs/MANUAL_SETUP.md); do not run the Windows provisioner there.

A clean-machine Windows end-to-end installation is not represented as verified merely because local tests pass. See [verification status](docs/VERIFICATION.md) for what was actually run.

## Credits

AR-Proxy: [insterbridge/AR-Proxy](https://github.com/insterbridge/AR-Proxy), MIT, copyright retained in [proxy/LICENSE](proxy/LICENSE). Local extension provenance: [UPSTREAM.json](UPSTREAM.json).

cc-switch is downloaded from [farion1231/cc-switch](https://github.com/farion1231/cc-switch), not repackaged here. The release checksum is pinned; third-party software and model licenses remain separate. This toolkit is not an official Anthropic, AgentRouter or cc-switch release.

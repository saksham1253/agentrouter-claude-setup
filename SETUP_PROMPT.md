# Copy-paste prompt: install my AgentRouter Claude Code setup

Copy the prompt below into a trusted coding assistant that can inspect files and run local commands. Give them this repository URL, **not your API key**. The assistant should read the source before execution and respect its host's permission boundaries.

---

Repository: **https://github.com/saksham1253/agentrouter-claude-setup**

You are setting up this toolkit on **my computer**, not copying the repository owner's private configuration. Finish the installation and verification rather than only giving me commands. Use my current OS, username, home folder, installed native executables and workspace; never assume the repo owner's paths or existing provider IDs.

## 1. Inspect before acting

1. Clone the repository into a fresh empty folder. If the proposed folder exists, inspect it; do not overwrite or reclone over my work.
2. Read `README.md`, `docs/SECURITY.md`, `docs/MANUAL_SETUP.md`, `docs/VERIFICATION.md`, the bootstrap/configuration scripts and existing project/host instructions.
3. Record OS/architecture, shell, Git, Bun, native Claude Code and cc-switch versions; find my actual workspace and config directories from installed settings. No secret-bearing settings dumps.
4. On Windows, check `scripts/bootstrap.ps1` and `scripts/configure.ts --help`. Automated provisioning supports cc-switch4.0.25/schema24. Do not downgrade or rewrite another version's schema. macOS/Linux use manual setup only.
5. Check whether an existing cc-switch application-directory override, `CLAUDE_CONFIG_DIR`, Stack mode, active proxy attachment or other provider routing exists. Do not guess or erase it. Use the manual path when the automated safety preflight refuses.
6. Run the repository's local tests. A missing dependency is part of your job to set up, but don't repeatedly install something already available.

## 2. Ask only the consequential questions

Use what you can discover from my computer. Ask me only for:
- Permission to route my Claude Code client away from its existing provider, if not already explicitly given.
- **Safe** permission profile (recommended) or **replica** profile. Replica includes unrestricted Bash/workflow/web allow rules and must be explicitly approved.
- Confirmation of a nonstandard workspace, endpoint or unsupported model IDs when it changes what you install.
- A small real inference/tool test using my quota, if needed; don't spend my quota silently.

API key: instruct me to enter my own key into a **private local file outside the repo**, or set `AGENTROUTER_API_KEY` locally. Never ask me to paste it into chat. Never print, upload, log, commit or put it on a command line. The client uses `PROXY_MANAGED`; only cc-switch's provider stores the real key. Backups are secret-bearing and stay local.

## 3. Install the declared prerequisites

Windows prerequisites: Bun1.4.4+, native Claude Code2.1.293+, cc-switch4.0.25portable, Git and PowerShell. Use official sources and the repository's bootstrap:

```powershell
.\scripts\bootstrap.ps1 -InstallPrerequisites -OpenBridge
```

Do not execute unknown downloaded scripts, use paste-and-pipe installers, bypass a denied tool call, or suppress validation failures. cc-switch portable ZIPs have pinned SHA256 digests for x64/ARM64. A mismatched digest must stop installation. Existing directories must not be overwritten.

Let cc-switch perform its **normal first launch**, initialize its full database and preserve/import the existing Claude provider. The first-run onboarding and workspace-trust choices belong to me; do not fabricate consent flags. Ask me to **Quit from the tray** when initialization finishes and to close Claude Code chats/CLI for the configuration operation. Merely closing cc-switch's window does not stop it. Don't force-kill someone else's process.

If configuration must happen after this assistant closes, prepare the exact command and let me run it; do not weaken the stopped-app guard just to finish inside an active Claude chat.

## 4. Preview, back up and apply additively

```powershell
bun .\scripts\configure.ts --profile safe
```

Read the preview. The intended chain is:

```text
Claude Code -> 127.0.0.1:15720 AR-Proxy -> 127.0.0.1:15721 cc-switch -> AgentRouter OpenAI Responses
```

Then apply only after routing/profile consent, with my private key file and real project path:

```powershell
bun .\scripts\configure.ts --apply --profile safe --key-file C:\private\agentrouter-key.txt --workspace C:\projects\my-project
```

If I explicitly chose replica:

```powershell
bun .\scripts\configure.ts --apply --profile replica --allow-broad-tools --key-file C:\private\agentrouter-key.txt --workspace C:\projects\my-project
```

Use `--cc-switch-exe` for my actual native app location. Resolve the upstream HTTPS base URL correctly; `/v1` conventions vary, so verify the final Responses path rather than doubling it. No localhost OmniRoute key is an AgentRouter key.

The installer's backup/receipt must exist before writes. Preserve existing providers and the direct-provider pointer. Add/update only the toolkit-owned provider. Never initialize a partial database by making two tables and stamping a schema version. Leave unknown future versions, unfinished attachment and foreign ID collisions untouched.

## 5. Verify the exact provider contract

For the toolkit-owned Claude provider:
- `meta.apiFormat = openai_responses`, **not** Anthropic or Chat Completions.
- `meta.claudeReasoningEffort = passthrough`.
- Default/Opus/Haiku -> `gpt-6.1-sol`.
- Sonnet -> `gpt-6-astra`.
- Client selectors remain known Claude-family strings; custom raw GPT IDs may otherwise be remapped to the default in cc-switch.
- Real API key belongs in the provider; client auth is `PROXY_MANAGED`.

These selectors are routing aliases, not actual Claude backend weights. Verify that my account has these current model IDs; don't fabricate access or substitute a model without telling me.

Preserve my current model/effort and other settings. Safe profile500k and replica1M auto-compaction remain ON, including existing per-model overrides. 1.5M is unsupported. The setting is capped by effective client context and does not enlarge backend capacity. Don't disable compaction or change hidden context limits as a workaround.

Do not force every request to maximum. Claude Code's selected effort should flow with each request. Same-model workflow agents inherit; explicit agent effort stays independent. Thinking on/off and Ultracode are separate controls. No fixed `CLAUDE_CODE_EFFORT_LEVEL` is introduced. Replica only supplies xhigh where there isn't an existing saved preference.

Permission rules are merged, not replaced. Keep explicit deny/ask, managed policy and web security preflight. Never add bypassPermissions, disable safety checks or approve publishing/spending merely because Bash is allowed.

## 6. Start services and use the VS Code chat panel

Open cc-switch and answer my legitimate prompts. Start the route without opening a separate work chat:

```powershell
bun .\scripts\start.ts --services-only
bun .\scripts\doctor.ts
```

Confirm both ports, AR-Proxy health, selected provider, format and mapping without printing credentials. Then reopen the VS Code Claude panel in the configured workspace. The project `settings.local.json` pin is important: cc-switch can rewrite the global endpoint to15721, which bypasses AR-Proxy. Confirm the effective workspace route is15720; don't broadly rewrite unrelated project settings.

If I want terminal Claude instead:

```powershell
bun .\scripts\start.ts
bun .\scripts\start.ts --model claude-sonnet-5
```

The native `.exe` is required on Windows, not a `.cmd/.bat` shim. Reusing a healthy running AR-Proxy does not change its flags; don't stop/restart it without checking identity and my consent when it can interrupt work.

## 7. Verify honestly

1. `bun test`: local tests only, report actual pass/fail/skip counts.
2. `bun scripts/scan-public.ts`: publication pattern check, not a promise of perfect secret detection.
3. Doctor: configuration plus local listener checks; neither proves inference.
4. Only with my explicit quota approval, run one short harmless genuine Claude Code reply for each selector and one harmless file-read tool test. Use an isolated no-hooks/no-persistence context where possible; don't replay my large private main chat just to test connectivity.
5. Confirm the actual returned model or cc-switch model route. A simple reply doesn't prove tool conversion works. Zero tokens in a dashboard isn't proof of success.
6. Test changing effort locally if the native fixture is available; do not claim saved preferences prove model reasoning/quality.

Distinguish:
- Foreign Azure reasoning-resource400: recognized opaque-state compatibility mitigation, not a context overflow.
- Context-window rejection: request too large; retries do not make it smaller.
- Token-rate limit or402budget pool: upstream capacity/quota, not permission prompts.
- Premature stream termination: only bounded before-visible-output recovery; never replay already-emitted tool work.
- `content-blocked`: remote rejection. Keep it intact and ask provider support for reason/false-positive review. Do not sanitize, rotate accounts/models or strip history to evade a safety block.

## 8. Hand over a working, recoverable setup

Tell me:
- Installed/reused versions and actual nonsecret paths.
- Effective chain/ports, selected model mapping, effort mode and compaction/profile.
- Tests that ran, failures/skips and whether a paid live test ran.
- What I must still confirm, especially onboarding/trust/custom-profile limits.
- Local backup/receipt paths and restore instructions. Restore must refuse later-changed files/database; don't discard my subsequent work.
- Key rotation: edit the one toolkit provider's credential in cc-switch and save. Usually the next request reads it; an in-flight request doesn't change retroactively. Do not reopen a duplicate provider for every key.
- How to restart services after shutdown and how to keep using the same VS Code panel.

No commits, uploads, secret disclosure, account changes, main-chat transcript edits, destructive cleanup or quota purchases unless I separately authorized them. Do not say “complete” or “fixed” until you have the evidence. Finish all unblocked work and open your final response with any remaining blocker.

---

This prompt is an installation instruction, not a guarantee of provider availability, model quality or a universally unattended first launch.

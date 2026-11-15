# Security, privacy and preservation

## What is never shipped

No real API keys, OAuth tokens, provider database, Claude transcript, user settings, private Orbit/PPT files, respondent contacts or machine-specific chat repairs belong in this repository. `.gitignore` excludes runtime/download/database/backups, and publication uses a reviewed file allowlist plus a pattern scan. A scan is not a mathematical guarantee of no secrets.

## Local secrets

- Put the recipient's key in a private file outside the repository, or a local environment variable. Never pass it as a CLI argument or send it to a remote assistant.
- The real key is stored in the toolkit-owned cc-switch provider only. Client auth remains `PROXY_MANAGED`.
- Local backups include prior credentials/provider data. Keep `.agentrouter-setup/backups` private; do not attach it to a public issue or push it.
- POSIX file modes are requested where supported. Windows files inherit their user's directory ACL; no administrator/everyone grant is added. Check your actual home/backup ACLs for shared machines.

## Permission profiles

Safe preserves existing allow/deny/ask and effort settings. Replica requires `--allow-broad-tools` and adds unrestricted Bash, Workflow, WebFetch and WebSearch. **Bash can run arbitrary shell commands**, not just Git/Bun. Allowing tools does not approve destructive commands, publishing, money, secret upload or provider safety bypass.

No `bypassPermissions`, disabled web preflight, managed deny removal, policy-helper change or workspace-trust auto-approval is added. Automatic workflow orchestration still follows the recipient's explicit opt-in and harness permissions; enabling the tool is not permission to spend unlimited quota.

## Provisioning and restoration

- The Windows process guard refuses cc-switch and Claude Code running. No force-kill or retry through another session.
- Normal cc-switch first launch is required; the toolkit does not create a partial schema or suppress import of the previous provider.
- Only version4.0.25/schema24 is accepted. Existing direct providers and queues stay preserved; conflicting Stack/failover/attachment settings require manual resolution.
- Config files are read/validated, backed up and merged. Foreign provider-ID collisions fail closed.
- A local exclusive operation lock serializes toolkit configure/restore invocations. A lock left after a crash must be inspected; don't automatically delete it because a heartbeat is old.
- SQLite snapshots include database state rather than blindly copying a WAL-dependent main file. The recovery receipt records stages and before/after fingerprints.
- Restore checks persistent schema, rows and relevant SQLite metadata, validates backups and rechecks destinations after process checks. If later user/app writes changed state, restore refuses rather than discard it.
- The toolkit has **no cooperating application-wide lock over cc-switch or external editors**. Keep apps/editors closed throughout setup/restore. Tiny external OS write races cannot be promised impossible; strict atomic cross-database/file provisioning needs an app-supported API.
- Rerunning installation is not permission to overwrite modified user files without inspection. A partial receipt is a diagnosis/recovery record, not proof everything applied.

## Networking and public downloads

Listeners default to loopback only. Upstream base URLs must be HTTPS without embedded username/password or query credentials. Portable cc-switch archives are downloaded from the official release and SHA256 verified. The repository does not vendor executable installers or route keys through a URL/deep link.

AR-Proxy health publishes only validated nonsecret routing/options; it never publishes credentials, prompts or reasoning. Unknown/mismatched running proxies are refused by the toolkit startup rather than silently reused or killed.

## Provider rejection is not a local permission problem

`content-blocked`, quotas, model/context limits and client restrictions remain provider decisions. Do not rewrite content or rotate accounts/models to evade safeguards. For suspected false positives, preserve the request ID and ask the provider to review it. Local permissions cannot unblock a remote policy rejection.

## Report a defect

Include toolkit version, OS, relevant nonsecret component versions and sanitized error/request ID. Never post full settings, databases, keys or private conversations. Vulnerabilities in third-party components should be reported to their maintainers too.

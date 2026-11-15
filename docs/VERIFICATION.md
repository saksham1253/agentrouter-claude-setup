# Verification status

Date:2026-11-15. This record separates tested behavior from full clean-machine/provider verification.

## Executed locally

- Bun1.4.4 Windows regression suite, including inherited HTTP/SSE/launcher/compaction/bridge tests and new disposable installer databases.
- Initial configuration tests failed before implementation; provisioning tests failed while provisioner was absent.
- Fresh review identified restore races/fingerprint omissions, overlay overwrite and mismatched proxy reuse. Tests reproduced these, then corrected behavior passed.
- Additional test verified toolkit provider ownership survives cc-switch dropping unknown metadata on save, using a local nonsecret ownership receipt.
- CLI option parsing/help executed; Windows PowerShell bootstrap parsed with the actual PowerShell parser.
- Secret/private-file pattern scanner executed against the public candidate tree. File allowlist reviewed separately. Scanner limitation is explicit.
- No recipient's real database/provider config changed during these tests. No private transcript or API key was copied into the public repository.

## Not claimed

- No clean-machine Windows installation performed end-to-end. Bootstrap official downloads/first-run desktop onboarding were not re-executed against the author's live setup just to prove a public installer.
- No live AgentRouter quota spent on installer validation; access/model quality/context capacity and current IDs must be verified by each recipient.
- No macOS/Linux automated installer. CI portable proxy/fixture tests do not imply a desktop provisioning implementation on those platforms.
- No impossible external-editor/app-wide race guarantee. Toolkit lock serializes its own operations; keep apps/editors closed. Unknown/changed state fails closed.
- Final local run: **241 pass, 4 Windows-specific skips, 0 fail**, 658 assertions across245tests/10files;25.84seconds. Publication scan passed; PowerShell scripts parsed.
- GitHub Actions is **not enabled** in this initial publication: the user's login lacks `workflow` scope, and they explicitly chose publication without CI. [ci-template.yml](ci-template.yml) is a reviewed template only, not a successful CI run.

## Existing platform skips

On Windows, four inherited POSIX launcher cases are skipped: SIGTERM forwarding, symlink-log handling, public POSIX log permissions and foreground-group interrupt behavior. They are not silently counted as passes.

## Error boundaries

A content-blocked request after a successful compaction can still be a remote provider rejection. A local native-loader diagnostic can verify summary presence and tool pairing without external inference; it cannot prove or bypass the provider's policy decision. The toolkit never fabricates successful completion, strips arbitrary history for content-filter evasion or purchases quota.

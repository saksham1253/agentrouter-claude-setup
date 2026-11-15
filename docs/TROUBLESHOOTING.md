# Troubleshooting by error category

Read the exact error and correlate request ID/timestamp with cc-switch logs. Redact credentials before sharing logs. Do not assume every slow request or zero-usage dashboard entry is context overflow.

| Symptom | What it means / action |
|---|---|
| HTTP400 foreign Azure resource item | Opaque reasoning state may belong to a different resource. This setup opt-in omits recognized cc-switch opaque carriers outbound, preserving written/tool history; native/unknown shapes are not blindly stripped. This is not compaction or a guarantee. |
| Input exceeds context window | Actual backend capacity rejection. Same-body retry won't fix it. Use native compaction or smaller inputs; a1M setting does not enlarge upstream capacity. |
| `content-blocked` / provider policy rejection | Remote content rejection, not AR-Proxy permission denial. Preserve the error and request ID. Ask provider support for reason/false-positive review. Do not bypass by rewriting hidden content, rotating accounts or disabling safeguards. |
| `Responses upstream stream ended before a terminal event` | Provider/bridge ended a stream early. Bounded retry only before visible output, recognized empty bridge state and inspection cap. Already-visible text/tools are not replayed; don't duplicate side effects. |
| `too_many_requests`, exceeded token rate | Upstream token/throughput limit. Large cached input also counts for context/request size; dashboard billing isn't a capacity contract. Reduce concurrent workload or wait for capacity; no limitless retry. |
| HTTP402 budget pool exhausted | Provider budget/account quota. Ask the account administrator; no automatic purchase, pool/account changes or claim proxy tuning repairs funding. |
| Client cancellation / context canceled | May be user/disconnect/queue/timeout. It isn't inherently context overflow. Separate60squeue budget avoids starting doomed work; normal retry/upstream bounds remain. |
| Wrong tools / function-call400 | Check provider format is OpenAI Responses, actual model and conversion. Simple text success doesn't prove tool calls. |
| Native exe missing | On Windows point to `.exe`; `.cmd/.bat` shims are rejected by the launcher. |
| Bridge configured but no listener | cc-switch must start its routing/controller and complete legitimate consent. `enabled` database values alone don't prove service running. |
| Proxy skipped | Client targets15721 instead of15720. Check workspace pin and higher-priority settings/launch overlays. |
| Frequent compaction | Inspect active-session native threshold, per-model override, effective model capacity and input+cached token totals. Safe500k/replica1M are configured windows, not guaranteed triggers. |
| Restore refused | Files or database changed after setup. This is preservation, not a defect to bypass. Inspect local backup and use normal app controls rather than overwrite subsequent work. |

## Small diagnosis sequence

1. Run `bun scripts/doctor.ts`: no inference spend.
2. Check AR-Proxy health locally and cc-switch loopback listener.
3. Verify active provider and mapping without printing the full settings/key.
4. Check recent error/request ID, don't upload private chat transcripts.
5. With explicit quota permission only, use a short isolated genuine Claude reply/tool-read test; do not replay a giant private main chat for a connection probe.
6. If only one old conversation is rejected, other successful chats establish connection—not why the old one failed. Do not edit transcript files while the conversation is open.

No tool setting overrides backend refusals, quotas, context capacity or managed device policy. Report unresolved causes honestly.

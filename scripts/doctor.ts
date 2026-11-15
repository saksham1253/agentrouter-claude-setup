import { Database } from "bun:sqlite";
import { join } from "node:path";
import { readOptional, resolvePaths, nativeClaude } from "./platform";
import { listening } from "./start";
import { PROVIDER_ID } from "./provision";

async function main() {
  const paths = await resolvePaths();
  const runtime = await readOptional(join(paths.home, ".agentrouter-setup", "runtime.json"));
  const settings = await readOptional(join(paths.claude, "settings.json"));
  const state = await readOptional(join(paths.home, ".cc-switch", "live-state.json"));
  const results: Array<{ check: string; pass: boolean; detail: string }> = [];
  const add = (check: string, pass: boolean, detail: string) => results.push({ check, pass, detail });
  try { nativeClaude(paths.home); add("native CLI", true, "native executable resolved"); } catch { add("native CLI", false, "Install Claude Code native runtime"); }
  const dbPath = join(paths.cc, "cc-switch.db");
  if (await Bun.file(dbPath).exists()) {
    const db = new Database(dbPath, { readonly: true });
    try {
      const row: any = db.query("SELECT meta,settings_config FROM providers WHERE id=? AND app_type='claude'").get(PROVIDER_ID);
      const meta = row ? JSON.parse(row.meta) : {};
      add("Responses provider", meta.apiFormat === "openai_responses", "provider exists and API format is Responses");
      add("dynamic effort", meta.claudeReasoningEffort === "passthrough", "client-selected effort, not fixed maximum");
      if (row) {
        const env = JSON.parse(row.settings_config).env || {};
        add("model routes", env.ANTHROPIC_DEFAULT_OPUS_MODEL === "gpt-6.1-sol" && env.ANTHROPIC_DEFAULT_SONNET_MODEL === "gpt-6-astra", "Sol/Astra family mapping");
      }
    } finally { db.close(); }
  } else add("bridge database", false, "Open cc-switch once to initialize");
  const proxyPort = Number(runtime.proxyPort || 15720), bridgePort = Number(runtime.bridgePort || 15721);
  add("client route", settings.env?.ANTHROPIC_BASE_URL === `http://127.0.0.1:${proxyPort}`, "Global endpoint; project settings can override it");
  add("native compaction", settings.autoCompactEnabled === true && settings.autoCompactWindow >= 100000 && settings.autoCompactWindow <= 1000000, "Window is configured, not backend capacity");
  add("desired bridge route", state.apps?.claude?.mode === "proxy" && state.apps.claude.proxy_route === PROVIDER_ID, "Configured for next launch");
  add("bridge listener", await listening(bridgePort), "TCP listener only; no authenticated model call");
  try {
    const r = await fetch(`http://127.0.0.1:${proxyPort}/__ar_proxy/health`, { signal: AbortSignal.timeout(1000) });
    add("AR-Proxy health", r.ok && (await r.json()).service === "AR-Proxy", "Local health, no inference");
  } catch { add("AR-Proxy health", false, "Run start --services-only"); }
  console.log(JSON.stringify({ mode: "read-only, no quota spent", results }, null, 2));
  if (results.some(x => !x.pass)) process.exitCode = 1;
}
main().catch(error => { console.error("Doctor stopped: " + error.message); process.exitCode = 1; });

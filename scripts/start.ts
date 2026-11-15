import { spawn } from "node:child_process";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { launchClaude, ensureProxy } from "../proxy/claude";
import { nativeClaude } from "./platform";
import { parseSettings } from "./config";

export async function listening(port: number): Promise<boolean> {
  return new Promise(resolve => { const socket = connect({ host: "127.0.0.1", port }); const finish = (ok: boolean) => { socket.destroy(); resolve(ok); }; socket.once("connect", () => finish(true)); socket.once("error", () => finish(false)); socket.setTimeout(300, () => finish(false)); });
}
export async function assertProxyConfiguration(port: number, bridgePort: number) {
  const response = await fetch(`http://127.0.0.1:${port}/__ar_proxy/health`, { signal: AbortSignal.timeout(1000), redirect: "manual" });
  const value = await response.json(); const c = value.configuration;
  if (!response.ok || value.service !== "AR-Proxy" || !c || c.upstream.replace(/\/+$/, "") !== `http://127.0.0.1:${bridgePort}` || c.responsesUpstream !== null || c.bigCtxConcurrency !== 3 || c.queueTimeoutMs !== 60000 || c.compactAtTokens !== 0 || c.omitBridgeReasoning !== true) throw new Error("Existing proxy configuration differs or is unknown; inspect it and request an approved restart, or select another port");
}
export async function start(args: string[]) {
  const home = homedir();
  const runtime = parseSettings(await readFile(join(home, ".agentrouter-setup", "runtime.json"), "utf8"));
  if (runtime.schema !== 1 || !Number.isInteger(runtime.bridgePort) || !Number.isInteger(runtime.proxyPort)) throw new Error("Invalid setup runtime; run doctor/configure first");
  const bridge = Number(runtime.bridgePort), port = Number(runtime.proxyPort);
  if (!(await listening(bridge))) {
    const exe = process.env.AGENTROUTER_CC_SWITCH_EXE || join(home, "cc-switch", "cc-switch.exe");
    if (!(await Bun.file(exe).exists())) throw new Error("cc-switch executable missing; set AGENTROUTER_CC_SWITCH_EXE");
    const child = spawn(exe, [], { cwd: home, detached: true, windowsHide: true, stdio: "ignore" });
    let launchError: Error | undefined; child.once("error", error => { launchError = error; }); child.unref();
    for (let i = 0; i < 100 && !(await listening(bridge)); i++) { if (launchError) throw launchError; await Bun.sleep(300); }
    if (!(await listening(bridge))) throw new Error("cc-switch routing did not start. Open it and enable Claude routing; consent/onboarding prompts are yours to answer.");
  }
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const log = join(home, ".agentrouter-setup", "AR-Proxy.log");
  const proxyArgs = ["--port", String(port), "--upstream", `http://127.0.0.1:${bridge}`, "--big-ctx-concurrency", "3", "--queue-timeout", "60000", "--compact-at-tokens", "0", "--omit-bridge-reasoning"];
  if (await listening(port)) await assertProxyConfiguration(port, bridge);
  if (args.includes("--services-only")) {
    if (args.length !== 1) throw new Error("--services-only takes no other arguments");
    await ensureProxy(port, proxyArgs, log, process.env);
    console.log(`Services ready: client -> http://127.0.0.1:${port} -> cc-switch:${bridge}. This is a listener check, not model inference.`);
    return 0;
  }
  return launchClaude(args, { ...process.env, AGENTROUTER_RETRY_PORT: String(port), AGENTROUTER_RETRY_UPSTREAM: `http://127.0.0.1:${bridge}`, AGENTROUTER_RETRY_RESPONSES_UPSTREAM: "", AGENTROUTER_RETRY_BIG_CTX_CONCURRENCY: "3", AGENTROUTER_RETRY_QUEUE_TIMEOUT: "60000", AGENTROUTER_RETRY_OMIT_BRIDGE_REASONING: "1", AGENTROUTER_RETRY_COMPACT_AT_TOKENS: "0", AGENTROUTER_RETRY_CLAUDE: nativeClaude(home), AGENTROUTER_RETRY_SETTINGS: join(runtime.claudeDirectory, "agentrouter-settings.json"), AGENTROUTER_RETRY_LOG: log });
}
if (import.meta.main) start(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => { console.error("Start stopped: " + error.message); process.exitCode = 1; });

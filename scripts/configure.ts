import { readFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import { provision } from "./provision";
import { assertAppsStopped, resolvePaths, parseCli, checkBridgeVersion } from "./platform";
import { validateOptions } from "./config";

const HELP = `AgentRouter Claude setup (Windows, cc-switch 4.0.25)

Preview: bun scripts/configure.ts --profile safe
Apply:   bun scripts/configure.ts --apply --key-file <private file>
Replica: bun scripts/configure.ts --apply --profile replica --allow-broad-tools --key-file <private file>

Options: --workspace <project folder>, --compact-window <100000..1000000>,
         --proxy-port <15720>, --bridge-port <15721>, --endpoint <https://agentrouter.org>,
         --cc-switch-exe <installed executable>

Never pass your API key in command-line arguments. --key-file reads it locally;
AGENTROUTER_API_KEY is an alternative. It is written only to cc-switch's provider.
Apply requires Claude Code and cc-switch to be closed. Open cc-switch once and
Quit to initialize its database first. Preview makes no changes or model calls.
`;
async function main() {
  const cli = parseCli(process.argv.slice(2));
  if (cli.flags.has("--help")) { console.log(HELP); return; }
  validateOptions(cli.options);
  const paths = await resolvePaths();
  if (!cli.flags.has("--apply")) {
    console.log(JSON.stringify({ mode: "preview-only", ...paths, options: cli.options, plan: ["Back up initialized cc-switch database and client settings", "Add or update one toolkit-owned Sol/Astra Responses provider", "Remember Claude proxy routing for next launch; preserve direct provider", "Merge localhost AR-Proxy routing and compaction; preserve other settings", "Optionally pin workspace routing; no API inference"] }, null, 2));
    return;
  }
  await assertAppsStopped();
  checkBridgeVersion(cli.values["--cc-switch-exe"] || join(paths.home, "cc-switch", "cc-switch.exe"));
  let key = process.env.AGENTROUTER_API_KEY || "";
  if (cli.values["--key-file"]) {
    const path = cli.values["--key-file"];
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 16384) throw new Error("Key file must be a small regular private file");
    key = (await readFile(path, "utf8")).trim();
  }
  if (!key) throw new Error("Supply your own key using --key-file or AGENTROUTER_API_KEY. Do not send it to the assistant or put it in this repository.");
  const receipt = await provision({ ...paths, workspace: cli.values["--workspace"], options: cli.options, key, endpoint: cli.values["--endpoint"] || "https://agentrouter.org", assertStopped: assertAppsStopped });
  key = "";
  console.log(JSON.stringify({ status: receipt.status, providerId: receipt.providerId, backupDirectory: receipt.backupDirectory, next: "Start cc-switch, then bun scripts/start.ts. This proves configuration only, not inference." }, null, 2));
}
main().catch(error => { console.error("Setup stopped: " + error.message); process.exitCode = 1; });

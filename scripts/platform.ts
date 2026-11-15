import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { readFile, lstat, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { parseSettings, type SetupOptions } from "./config";

export function windowsProfile() {
  if (process.platform !== "win32") throw new Error("Automated configuration is Windows-only; see manual setup for other systems");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::GetFolderPath('UserProfile')"], { encoding: "utf8", windowsHide: true, timeout: 10000 });
  if (result.status !== 0 || !result.stdout.trim()) throw new Error("Cannot resolve the Windows profile directory");
  return result.stdout.trim();
}
export async function assertAppsStopped() {
  if (process.platform !== "win32") throw new Error("Windows process inspection unavailable");
  const command = "@(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('cc-switch.exe','claude.exe') } | Select-Object ProcessId,Name) | ConvertTo-Json -Compress";
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", timeout: 10000, windowsHide: true });
  if (result.status !== 0) throw new Error("Process inspection failed; no configuration changed");
  const rows = result.stdout.trim() ? JSON.parse(result.stdout) : [];
  if ((Array.isArray(rows) ? rows : [rows]).length) throw new Error("Quit cc-switch from its tray and close Claude Code chats/CLI before configuration or restore. Do not merely close the cc-switch window.");
}
export async function readOptional(path: string) {
  try { return parseSettings(await readFile(path, "utf8")); } catch (e: any) { if (e.code === "ENOENT") return {}; throw e; }
}
export async function resolvePaths() {
  for (const key of ["CC_SWITCH_TEST_HOME", "CLAUDE_CONFIG_DIR"]) if (process.env[key]) throw new Error(`${key} is set; custom profile requires manual setup, not guessed paths`);
  const home = windowsProfile();
  const local = await readOptional(join(home, ".cc-switch", "settings.json"));
  const store = await readOptional(join(process.env.APPDATA || join(home, "AppData", "Roaming"), "com.ccswitch.desktop", "app_paths.json"));
  let cc = join(home, ".cc-switch");
  if (store.app_config_dir_override) {
    if (typeof store.app_config_dir_override !== "string") throw new Error("Invalid app configuration directory override");
    cc = resolve(store.app_config_dir_override); await access(cc);
  } else {
    const defaultDb = Bun.file(join(cc, "cc-switch.db"));
    const legacy = process.env.HOME && join(process.env.HOME, ".cc-switch");
    if (!(await defaultDb.exists()) && legacy && await Bun.file(join(legacy, "cc-switch.db")).exists()) cc = legacy;
  }
  const claude = local.claudeConfigDir ? resolve(local.claudeConfigDir) : join(home, ".claude");
  return { home, cc, claude };
}
export function parseCli(args: string[]) {
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  const bool = new Set(["--apply", "--allow-broad-tools", "--help"]);
  const names = new Set(["--profile", "--compact-window", "--proxy-port", "--bridge-port", "--endpoint", "--workspace", "--key-file", "--cc-switch-exe"]);
  for (let i = 0; i < args.length; i++) {
    if (bool.has(args[i])) flags.add(args[i]);
    else if (names.has(args[i]) && args[i + 1] && !args[i + 1].startsWith("--")) values[args[i]] = args[++i];
    else throw new Error("Unknown option or missing value: " + args[i]);
  }
  const options: SetupOptions = { proxyPort: Number(values["--proxy-port"] || 15720), bridgePort: Number(values["--bridge-port"] || 15721), compactWindow: Number(values["--compact-window"] || (values["--profile"] === "replica" ? 1000000 : 500000)), profile: (values["--profile"] || "safe") as SetupOptions["profile"], allowBroadTools: flags.has("--allow-broad-tools") };
  return { values, flags, options };
}
export function checkBridgeVersion(exe: string) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "(Get-Item -LiteralPath $env:SETUP_CC_EXE).VersionInfo.ProductVersion"], { encoding: "utf8", timeout: 10000, windowsHide: true, env: { ...process.env, SETUP_CC_EXE: exe } });
  if (result.status !== 0 || !/^4\.0\.25(?:\D|$)/.test(result.stdout.trim())) throw new Error("Provisioning supports cc-switch v4.0.25 only; specify --cc-switch-exe or use manual setup for another version");
}
export function nativeClaude(home = homedir()) {
  const candidate = process.env.AGENTROUTER_RETRY_CLAUDE || join(home, ".local", "bin", "claude.exe");
  const found = Bun.which(candidate) || Bun.which("claude");
  if (!found || (process.platform === "win32" && !found.toLowerCase().endsWith(".exe"))) throw new Error("Native Claude executable missing; install Claude Code or set AGENTROUTER_RETRY_CLAUDE to the native executable, not a .cmd shim");
  return found;
}

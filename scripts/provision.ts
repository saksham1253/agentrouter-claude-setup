import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, lstat, rename, unlink } from "node:fs/promises";
import { join, resolve, dirname, basename, relative, isAbsolute } from "node:path";
import { readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { parseSettings, mergeClaudeSettings, providerTemplate, validateOptions, type SetupOptions } from "./config";

export const PROVIDER_ID = "agentrouter-claude-setup-v1";
const sha = (b: string | Uint8Array) => createHash("sha256").update(b).digest("hex");
type FileRecord = { path: string; backup: string | null; before: string | null; after: string | null };
type Receipt = { schema: 1; status: string; home: string; cc: string; claude: string; providerId: string; backupDirectory: string; databaseBefore: string; databaseAfter: string | null; files: FileRecord[] };
export type ProvisionInput = { home: string; cc?: string; claude?: string; workspace?: string; options: SetupOptions; key: string; endpoint: string; assertStopped: () => Promise<void> };

async function safePath(path: string) {
  let cursor = resolve(path);
  for (;;) {
    try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error("Refusing symlink/junction path: " + cursor); }
    catch (e: any) { if (e.code !== "ENOENT") throw e; }
    const parent = dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
}
async function bytes(path: string): Promise<Buffer | null> {
  await safePath(path);
  try { const s = await lstat(path); if (!s.isFile()) throw new Error("Not a regular file: " + path); return await readFile(path); }
  catch (e: any) { if (e.code === "ENOENT") return null; throw e; }
}
async function atomic(path: string, value: string | Uint8Array) {
  await safePath(path); await mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), ".setup-" + randomUUID() + ".pending");
  await writeFile(tmp, value, { flag: "wx", mode: 0o600 });
  await rename(tmp, path);
}
function dbHash(db: Database) {
  const schema = db.query("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").all();
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>;
  const rows = tables.map(t => [t.name, db.query('SELECT * FROM "' + t.name.replaceAll('"', '""') + '"').all().map(row => JSON.stringify(row)).sort()]);
  return sha(JSON.stringify([schema, rows, db.query("PRAGMA user_version").get(), db.query("PRAGMA application_id").get()]));
}
async function operation<T>(home: string, work: () => Promise<T>): Promise<T> {
  const dir = join(resolve(home), ".agentrouter-setup"); await safePath(dir); await mkdir(dir, { recursive: true });
  const file = join(dir, "operation.lock");
  try { await writeFile(file, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }), { flag: "wx", mode: 0o600 }); }
  catch (e: any) { if (e.code === "EEXIST") throw new Error("Another toolkit operation is active or left a recovery lock; inspect before retrying"); throw e; }
  try { return await work(); } finally { await unlink(file); }
}
function validateDb(db: Database) {
  const version: any = db.query("PRAGMA user_version").get();
  if (version.user_version !== 24) throw new Error("Unsupported cc-switch schema; use v4.0.25 and initialize/migrate it once before setup");
  const result: any = db.query("PRAGMA quick_check").get();
  if (result.quick_check !== "ok") throw new Error("Database integrity check failed");
  for (const [table, required] of [["providers", ["id", "app_type", "name", "settings_config", "meta", "created_at", "is_current", "in_failover_queue"]], ["proxy_config", ["app_type", "listen_address", "listen_port", "enabled", "proxy_enabled", "auto_failover_enabled"]]] as const) {
    const cols = new Set((db.query(`PRAGMA table_info(${table})`).all() as any[]).map(x => x.name));
    if (required.some(c => !cols.has(c))) throw new Error("Unexpected database schema: " + table);
  }
  if (!db.query("SELECT id FROM providers WHERE app_type='claude' LIMIT 1").get()) throw new Error("Initialization required: open cc-switch once to preserve/import existing Claude provider, then Quit and rerun");
  if (!db.query("SELECT app_type FROM proxy_config WHERE app_type='claude'").get()) throw new Error("Missing Claude proxy row; initialize cc-switch first");
}
export async function provision(input: ProvisionInput): Promise<Receipt> {
  return operation(input.home, () => provisionUnlocked(input));
}
async function provisionUnlocked(input: ProvisionInput): Promise<Receipt> {
  validateOptions(input.options);
  const provider = providerTemplate(input.key, input.endpoint);
  await input.assertStopped();
  const home = resolve(input.home), cc = resolve(input.cc || join(home, ".cc-switch")), claude = resolve(input.claude || join(home, ".claude"));
  const dbPath = join(cc, "cc-switch.db");
  if (!(await bytes(dbPath))) throw new Error("Initialization required: open cc-switch once, then Quit from the tray and rerun");
  const ccSettingsPath = join(home, ".cc-switch", "settings.json"), statePath = join(home, ".cc-switch", "live-state.json");
  const settingsPath = join(claude, "settings.json"), overlayPath = join(claude, "agentrouter-settings.json");
  const runtimePath = join(home, ".agentrouter-setup", "runtime.json");
  const ownerPath = join(home, ".agentrouter-setup", "provider-owner.json");
  const files = [ccSettingsPath, statePath, settingsPath, overlayPath, runtimePath, ownerPath];
  if (input.workspace) files.push(join(resolve(input.workspace), ".claude", "settings.local.json"));
  const original = new Map<string, Buffer | null>();
  for (const path of files) original.set(path, await bytes(path));
  const json = (path: string) => original.get(path) ? parseSettings(original.get(path)!.toString("utf8")) : {};
  const local = json(ccSettingsPath), state = json(statePath), user = json(settingsPath);
  if (state.version !== undefined && state.version !== 1) throw new Error("Unsupported live-state version");
  const live = state.apps?.claude || {};
  if (live.attached) throw new Error("Claude proxy is still attached; Quit cc-switch cleanly before setup");
  if (live.pending || live.contract) throw new Error("pending or residual attachment requires cc-switch recovery first");
  if (live.stack?.enabled || local.enableStackMode) throw new Error("Stack mode enabled; select normal Claude routing manually first");
  if (local.proxyClientHost && local.proxyClientHost !== "127.0.0.1") throw new Error("Conflicting proxyClientHost; resolve it in cc-switch first");
  if (user.env?.ANTHROPIC_AUTH_TOKEN === "PROXY_MANAGED" && live.mode !== "proxy") throw new Error("Residual PROXY_MANAGED client state; recover using cc-switch before provisioning");
  const db = new Database(dbPath, { readwrite: true });
  try {
    validateDb(db);
    if (db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='proxy_live_backup'").get() && db.query("SELECT app_type FROM proxy_live_backup WHERE app_type='claude'").get()) throw new Error("A legacy live backup requires normal cc-switch recovery before provisioning");
    const proxyRow: any = db.query("SELECT * FROM proxy_config WHERE app_type='claude'").get();
    if (proxyRow.auto_failover_enabled) throw new Error("Automatic failover is enabled; turn it off for deterministic Sol/Astra selection first");
    if (proxyRow.listen_port !== input.options.bridgePort) throw new Error("Existing bridge port differs; select that port explicitly or change it in cc-switch first");
    const existing: any = db.query("SELECT * FROM providers WHERE id=? AND app_type='claude'").get(PROVIDER_ID);
    const ownerBytes = original.get(ownerPath); const owner = ownerBytes ? parseSettings(ownerBytes.toString("utf8")) : {};
    if (existing && parseSettings(existing.meta).setupToolkit !== PROVIDER_ID && !(owner.providerId === PROVIDER_ID && owner.createdAt === existing.created_at && owner.databasePath === dbPath)) throw new Error("Toolkit provider ID collision; existing provider was not created by this toolkit");
    const direct: any = local.currentProviderClaude ? db.query("SELECT id FROM providers WHERE id=? AND app_type='claude'").get(local.currentProviderClaude) : db.query("SELECT id FROM providers WHERE app_type='claude' AND is_current=1").get();
    if (!direct) throw new Error("Existing direct-provider pointer missing; choose a direct provider in cc-switch first");
    const backupDirectory = join(home, ".agentrouter-setup", "backups", new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID());
    await safePath(backupDirectory); await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    db.exec("BEGIN IMMEDIATE");
    let committed = false;
    const receipt: Receipt = { schema: 1, status: "prepared", home, cc, claude, providerId: PROVIDER_ID, backupDirectory, databaseBefore: dbHash(db), databaseAfter: null, files: [] };
    const saveReceipt = () => atomic(join(backupDirectory, "receipt.json"), JSON.stringify(receipt, null, 2));
    try {
      await writeFile(join(backupDirectory, "cc-switch.db"), db.serialize(), { flag: "wx", mode: 0o600 });
      for (const [index, path] of files.entries()) {
        const value = original.get(path)!; const backup = value ? `${index}-${basename(path)}` : null;
        if (value) await writeFile(join(backupDirectory, backup!), value, { flag: "wx", mode: 0o600 });
        receipt.files.push({ path, backup, before: value ? sha(value) : null, after: null });
      }
      await saveReceipt(); await input.assertStopped();
      for (const path of files) if (sha((await bytes(path)) || "") !== sha(original.get(path) || "")) throw new Error("Settings changed during setup; no database changes committed");
      if (existing) {
        const meta = { ...parseSettings(existing.meta), ...provider.meta };
        const config = parseSettings(existing.settings_config); config.env = { ...config.env, ...provider.settings_config.env };
        db.query("UPDATE providers SET settings_config=?,meta=? WHERE id=? AND app_type='claude'").run(JSON.stringify(config), JSON.stringify(meta), PROVIDER_ID);
      } else {
        db.query("INSERT INTO providers(id,app_type,name,settings_config,meta,created_at,is_current,in_failover_queue) VALUES(?,'claude',?,?,?,?,0,0)").run(PROVIDER_ID, provider.name, JSON.stringify(provider.settings_config), JSON.stringify(provider.meta), Date.now());
      }
      db.query("UPDATE proxy_config SET enabled=1 WHERE app_type='claude'").run();
      const post = dbHash(db); receipt.databaseAfter = post; receipt.status = "database-commit-pending"; await saveReceipt();
      db.exec("COMMIT"); committed = true;
      receipt.status = "files-pending"; await saveReceipt();
      const merged = mergeClaudeSettings(user, input.options);
      const oldOverlay = json(overlayPath);
      const overlay = mergeClaudeSettings(oldOverlay, { ...input.options, profile: "safe", allowBroadTools: false });
      if (oldOverlay.model === undefined) delete overlay.model;
      if (oldOverlay.modelPicker === undefined) delete overlay.modelPicker;
      local.enableLocalProxy = true;
      state.version = 1; state.apps ??= {}; state.apps.claude = { ...live, mode: "proxy", attached: false, proxy_route: PROVIDER_ID };
      const runtime = { schema: 1, proxyPort: input.options.proxyPort, bridgePort: input.options.bridgePort, claudeDirectory: claude, ccDirectory: cc, home, compactWindow: input.options.compactWindow };
      const currentOwner: any = db.query("SELECT created_at FROM providers WHERE id=? AND app_type='claude'").get(PROVIDER_ID);
      const ownership = { schema: 1, providerId: PROVIDER_ID, createdAt: currentOwner.created_at, databasePath: dbPath };
      const generated = [local, state, merged, overlay, runtime, ownership];
      if (input.workspace) { const project = json(files[6]); project.env = { ...project.env, ANTHROPIC_BASE_URL: `http://127.0.0.1:${input.options.proxyPort}` }; generated.push(project); }
      for (const [index, path] of files.entries()) {
        await input.assertStopped(); const current = await bytes(path);
        if ((current ? sha(current) : null) !== receipt.files[index].before) throw new Error("Client files changed during provisioning; restore requires inspection: " + backupDirectory);
        const output = JSON.stringify(generated[index], null, 2) + "\n";
        receipt.files[index].after = sha(output); await saveReceipt();
        await atomic(path, output);
      }
      receipt.status = "applied"; await saveReceipt();
      return receipt;
    } catch (e) {
      if (!committed) db.exec("ROLLBACK");
      receipt.status = committed ? "partial-inspect-before-restore" : "not-applied"; await saveReceipt();
      throw e;
    }
  } finally { db.close(); }
}
export async function restore(backupDirectory: string, assertStopped: () => Promise<void>) {
  const receipt = JSON.parse(await readFile(join(backupDirectory, "receipt.json"), "utf8")) as Receipt;
  return operation(receipt.home, () => restoreUnlocked(backupDirectory, assertStopped));
}
async function restoreUnlocked(backupDirectory: string, assertStopped: () => Promise<void>) {
  await assertStopped(); await safePath(backupDirectory);
  const receipt = JSON.parse(await readFile(join(backupDirectory, "receipt.json"), "utf8")) as Receipt;
  if (receipt.schema !== 1 || !["applied", "partial-inspect-before-restore", "files-pending", "database-commit-pending"].includes(receipt.status)) throw new Error("Unsupported or unapplied backup receipt");
  const within = (parent: string, path: string) => { const rel = relative(resolve(parent), resolve(path)); return !rel.startsWith("..") && !isAbsolute(rel); };
  const allowed = [join(receipt.home, ".cc-switch", "settings.json"), join(receipt.home, ".cc-switch", "live-state.json"), join(receipt.claude, "settings.json"), join(receipt.claude, "agentrouter-settings.json"), join(receipt.home, ".agentrouter-setup", "runtime.json"), join(receipt.home, ".agentrouter-setup", "provider-owner.json")].map(resolvePath => resolve(resolvePath));
  if (receipt.files.some(f => !allowed.includes(resolve(f.path)) && !f.path.replaceAll("\\", "/").endsWith("/.claude/settings.local.json"))) throw new Error("Unexpected receipt paths");
  for (const f of receipt.files) {
    const current = await bytes(f.path), hash = current ? sha(current) : null;
    if (hash !== f.after && hash !== f.before) throw new Error("File changed after setup; refusing to overwrite: " + f.path);
    if (f.backup) {
      if (!within(backupDirectory, join(backupDirectory, f.backup))) throw new Error("Unsafe backup path");
      if (sha(await readFile(join(backupDirectory, f.backup))) !== f.before) throw new Error("Backup changed or damaged");
    }
  }
  const path = join(receipt.cc, "cc-switch.db"); await safePath(path);
  const db = new Database(path, { readwrite: true });
  try {
    const hash = dbHash(db); if (hash !== receipt.databaseAfter && hash !== receipt.databaseBefore) throw new Error("Database changed after setup; refusing whole-database restore");
    const snap = new Database(join(backupDirectory, "cc-switch.db"), { readonly: true });
    try { if (dbHash(snap) !== receipt.databaseBefore) throw new Error("Database backup damaged"); } finally { snap.close(); }
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); db.exec("PRAGMA journal_mode=DELETE");
  } finally { db.close(); }
  await assertStopped();
  const finalDb = new Database(path, { readwrite: true });
  try {
    finalDb.exec("BEGIN EXCLUSIVE");
    const hash = dbHash(finalDb); if (hash !== receipt.databaseAfter && hash !== receipt.databaseBefore) throw new Error("Database changed during restore");
    for (const f of receipt.files) {
      const current = await bytes(f.path), hash = current ? sha(current) : null;
      if (hash !== f.after && hash !== f.before) throw new Error("File changed during restore: " + f.path);
    }
    finalDb.exec("ROLLBACK");
  } catch (e) { try { finalDb.exec("ROLLBACK"); } catch {} throw e; }
  finally { finalDb.close(); }
  const dbTemp = join(dirname(path), ".restore-" + randomUUID() + ".pending");
  writeFileSync(dbTemp, readFileSync(join(backupDirectory, "cc-switch.db")), { flag: "wx", mode: 0o600 });
  renameSync(dbTemp, path);
  for (const f of receipt.files) {
    await assertStopped();
    const current = await bytes(f.path), hash = current ? sha(current) : null;
    if (hash !== f.after && hash !== f.before) throw new Error("File changed during restore: " + f.path);
    if (f.backup) {
      const output = readFileSync(join(backupDirectory, f.backup));
      const temp = join(dirname(f.path), ".restore-" + randomUUID() + ".pending");
      writeFileSync(temp, output, { flag: "wx", mode: 0o600 }); renameSync(temp, f.path);
    } else if (current) unlinkSync(f.path);
  }
  receipt.status = "restored"; await atomic(join(backupDirectory, "receipt.json"), JSON.stringify(receipt, null, 2));
  return { restored: true, providerId: receipt.providerId };
}

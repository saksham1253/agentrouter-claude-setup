import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const dirs: string[] = [];
afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }); });
async function api() { try { return await import("../scripts/provision"); } catch { return {} as any; } }
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "setup-fixture-")); dirs.push(home);
  const cc = join(home, ".cc-switch"); await mkdir(cc); await mkdir(join(home, ".claude"));
  const db = new Database(join(cc, "cc-switch.db"));
  db.exec(`PRAGMA user_version=24; CREATE TABLE providers(id TEXT,app_type TEXT,name TEXT,settings_config TEXT,meta TEXT,created_at INTEGER,is_current INTEGER DEFAULT 0,in_failover_queue INTEGER DEFAULT 0,PRIMARY KEY(id,app_type));
    CREATE TABLE proxy_config(app_type TEXT PRIMARY KEY,listen_address TEXT,listen_port INTEGER,enabled INTEGER,proxy_enabled INTEGER,auto_failover_enabled INTEGER);
    INSERT INTO providers VALUES('existing','claude','Original','{"env":{"KEEP":"fixture"}}','{}',1234,1,0);
    INSERT INTO proxy_config VALUES('claude','127.0.0.1',15721,0,0,0);`);
  db.close();
  await writeFile(join(cc, "settings.json"), JSON.stringify({currentProviderClaude:"existing",language:"en"}));
  await writeFile(join(cc, "live-state.json"), JSON.stringify({version:1,apps:{claude:{mode:"direct",attached:false},codex:{mode:"direct",keep:"yes"}}}));
  await writeFile(join(home, ".claude", "settings.json"), JSON.stringify({permissions:{allow:["Read"]},env:{KEEP:"yes"}}));
  return { home, cc, options: {proxyPort:15720,bridgePort:15721,compactWindow:500000,profile:"safe",allowBroadTools:false}, key:"fixture-key-not-real", endpoint:"https://agentrouter.org", assertStopped:async()=>{} };
}
describe("stopped-app provisioning", () => {
  test("adds one owned provider, backs up, and preserves existing direct provider", async () => {
    const { provision } = await api(); expect(typeof provision).toBe("function");
    const f=await fixture(); const receipt=await provision(f);
    const db=new Database(join(f.cc,"cc-switch.db"),{readonly:true});
    expect(db.query("SELECT settings_config,is_current FROM providers WHERE id='existing'").get()).toEqual({settings_config:'{"env":{"KEEP":"fixture"}}',is_current:1});
    const owned:any=db.query("SELECT * FROM providers WHERE id=?").get(receipt.providerId);
    expect(typeof owned.created_at).toBe("number");
    expect(JSON.parse(owned.meta).claudeReasoningEffort).toBe("passthrough");
    db.close();
    const state=JSON.parse(await readFile(join(f.cc,"live-state.json"),"utf8"));
    expect(state.apps.claude).toMatchObject({mode:"proxy",attached:false,proxy_route:receipt.providerId});
    expect(state.apps.codex).toEqual({mode:"direct",keep:"yes"});
    expect(state.apps.claude.contract).toBeUndefined();
    expect(JSON.parse(await readFile(join(f.cc,"settings.json"),"utf8")).currentProviderClaude).toBe("existing");
    expect(JSON.stringify(receipt)).not.toContain(f.key);
    expect(await Bun.file(join(receipt.backupDirectory,"cc-switch.db")).exists()).toBe(true);
  });
  test("refuses live or interrupted attachment before changing anything", async () => {
    const { provision } = await api(); expect(typeof provision).toBe("function");
    const f=await fixture();
    await writeFile(join(f.cc,"live-state.json"),JSON.stringify({version:1,apps:{claude:{mode:"proxy",attached:true}}}));
    await expect(provision(f)).rejects.toThrow("attached");
    await writeFile(join(f.cc,"live-state.json"),JSON.stringify({version:1,apps:{claude:{pending:{operation:"attach"}}}}));
    await expect(provision(f)).rejects.toThrow("pending");
    const db=new Database(join(f.cc,"cc-switch.db"),{readonly:true});expect(db.query("SELECT count(*) AS n FROM providers").get()).toEqual({n:1});db.close();
  });
  test("refuses unsupported schema and running process", async () => {
    const { provision } = await api(); expect(typeof provision).toBe("function");
    const f=await fixture();
    await expect(provision({...f,assertStopped:async()=>{throw new Error("running");}})).rejects.toThrow("running");
    const db=new Database(join(f.cc,"cc-switch.db"));db.exec("PRAGMA user_version=999");db.close();
    await expect(provision(f)).rejects.toThrow("schema");
  });
  test("rerun updates only owned card and refuses unknown ID collision", async () => {
    const { provision } = await api(); expect(typeof provision).toBe("function");
    const f=await fixture();const one=await provision(f);const two=await provision({...f,key:"fixture-rotated"});
    expect(two.providerId).toBe(one.providerId);
    const db=new Database(join(f.cc,"cc-switch.db"));
    expect(db.query("SELECT count(*) AS n FROM providers").get()).toEqual({n:2});
    db.query("UPDATE providers SET meta='{}',created_at=1 WHERE id=?").run(one.providerId);db.close();
    await expect(provision(f)).rejects.toThrow("collision");
  });
  test("restore checks hashes and restores absent files safely", async () => {
    const { provision, restore } = await api(); expect(typeof restore).toBe("function");
    const f=await fixture();const one=await provision(f);
    await restore(one.backupDirectory,async()=>{});
    const db=new Database(join(f.cc,"cc-switch.db"),{readonly:true});expect(db.query("SELECT count(*) AS n FROM providers").get()).toEqual({n:1});db.close();
    expect(await Bun.file(join(f.home,".claude","agentrouter-settings.json")).exists()).toBe(false);
    const two=await provision(f);
    await writeFile(join(f.home,".claude","settings.json"),'{"changedByUser":true}');
    await expect(restore(two.backupDirectory,async()=>{})).rejects.toThrow("changed");
  });
  test("preserves user launcher overlay preferences", async () => {
    const {provision}=await api();const f=await fixture();
    await writeFile(join(f.home,'.claude','agentrouter-settings.json'),JSON.stringify({hooks:{Stop:[]},permissions:{deny:['Bash(rm *)']},env:{KEEP_OVERLAY:'yes'}}));
    await provision(f);
    const d=JSON.parse(await readFile(join(f.home,'.claude','agentrouter-settings.json'),'utf8'));
    expect(d.hooks).toEqual({Stop:[]});expect(d.permissions.deny).toEqual(['Bash(rm *)']);expect(d.env.KEEP_OVERLAY).toBe('yes');
  });
  test("restore refuses persisted schema changes", async()=>{
    const {provision,restore}=await api();const f=await fixture();const one=await provision(f);
    const db=new Database(join(f.cc,'cc-switch.db'));db.exec('CREATE INDEX new_user_index ON providers(name)');db.close();
    await expect(restore(one.backupDirectory,async()=>{})).rejects.toThrow('changed');
  });
  test("restore rechecks changes after its awaited process guard",async()=>{
    const {provision,restore}=await api();const f=await fixture();const one=await provision(f);let calls=0;
    await expect(restore(one.backupDirectory,async()=>{calls++;if(calls===2)await writeFile(join(f.home,'.claude','settings.json'),'{"savedDuringRestore":true}');})).rejects.toThrow('changed');
    expect(JSON.parse(await readFile(join(f.home,'.claude','settings.json'),'utf8'))).toEqual({savedDuringRestore:true});
  });
  test("refuses legacy live backup residue",async()=>{
    const {provision}=await api();const f=await fixture();
    const db=new Database(join(f.cc,'cc-switch.db'));db.exec("CREATE TABLE proxy_live_backup(app_type TEXT PRIMARY KEY,original_config TEXT,backed_up_at TEXT); INSERT INTO proxy_live_backup VALUES('claude','{}','legacy')");db.close();
    await expect(provision(f)).rejects.toThrow('legacy');
  });
  test("retains toolkit ownership after cc-switch normalizes unknown metadata",async()=>{
    const {provision}=await api();const f=await fixture();const one=await provision(f);
    const db=new Database(join(f.cc,'cc-switch.db'));const row:any=db.query('SELECT meta FROM providers WHERE id=?').get(one.providerId);const meta=JSON.parse(row.meta);delete meta.setupToolkit;db.query('UPDATE providers SET meta=? WHERE id=?').run(JSON.stringify(meta),one.providerId);db.close();
    const two=await provision({...f,key:'fixture-next'});expect(two.providerId).toBe(one.providerId);
  });
  test("serializes competing toolkit provisioning operations",async()=>{
    const {provision}=await api();const f=await fixture();await mkdir(join(f.home,'.agentrouter-setup'));
    await writeFile(join(f.home,'.agentrouter-setup','operation.lock'),'another operation');
    await expect(provision(f)).rejects.toThrow('operation');
  });
});

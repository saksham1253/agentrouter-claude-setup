import { readdir, readFile } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
export function inspectPublicFile(path: string, text: string) {
  const issues: string[] = [];
  if (/\.(?:db|db-wal|db-shm|sqlite\d?|jsonl|bak|exe|msi|zip)$/i.test(path)) issues.push("Private/runtime/binary file must not be published");
  if (/(?:sk-(?:ant-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|Bearer\s+[A-Za-z0-9_.-]{40,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/.test(text)) issues.push("Potential credential detected");
  if (/AGENTROUTER_API_KEY\s*=\s*[A-Za-z0-9_-]{40,}/.test(text)) issues.push("Potential provider key detected");
  if (/[A-Z]:[\\/]Users[\\/](?!YOUR_USER(?:[\\/]|$))[^\s"'\\/]+[\\/]|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(text)) issues.push("Private machine/session identifier detected; inspect before publishing");
  return issues;
}
export async function scan(root: string) {
  const findings: Array<{ path: string; issues: string[] }> = [];
  async function visit(dir: string) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      if ([".git", "node_modules", "runtime", "downloads", "backups"].includes(item.name)) continue;
      const path = join(dir, item.name), rel = relative(root, path).replaceAll("\\", "/");
      if (item.isSymbolicLink()) { findings.push({ path: rel, issues: ["Symlinks are not public toolkit inputs"] }); continue; }
      if (item.isDirectory()) await visit(path);
      else { const issues = inspectPublicFile(rel, await readFile(path, "utf8")); if (issues.length) findings.push({ path: rel, issues }); }
    }
  }
  await visit(root); return findings;
}
if (import.meta.main) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const findings = await scan(root);
  console.log(JSON.stringify({ pass: findings.length === 0, findings, limitation: "Pattern scan plus explicit file allowlist; not a guarantee against all secrets" }, null, 2));
  if (findings.length) process.exitCode = 1;
}

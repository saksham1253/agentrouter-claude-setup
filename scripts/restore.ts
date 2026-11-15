import { restore } from "./provision";
import { assertAppsStopped } from "./platform";
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--backup") {
  console.error("Usage: bun scripts/restore.ts --backup <local backup directory>\nClose Claude Code and Quit cc-switch first. Restore refuses changed files/databases; it never discards later user work.");
  process.exitCode = 1;
} else restore(args[1], assertAppsStopped).then(result => console.log(JSON.stringify(result))).catch(error => { console.error("Restore stopped: " + error.message); process.exitCode = 1; });

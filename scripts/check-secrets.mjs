import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ignore = new Set(['node_modules', '.git', '.cache', '.local', '.env', 'coverage', 'artifacts']);
let scanned = 0;
const failures = [];
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (ignore.has(entry.name) || entry.name.startsWith('.env.') && entry.name !== '.env.example' || entry.name.endsWith('.zip')) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { await scan(file); continue; }
    if (!/\.(?:[cm]?[jt]sx?|sql|json|html|md|ya?ml|example|txt)$/.test(entry.name)) continue;
    const content = await readFile(file, 'utf8'); scanned++;
    let leak = /sb_secret_[A-Za-z0-9_-]{12,}|(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})|postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/.test(content);
    for (const match of content.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
      try { if (JSON.parse(Buffer.from(match[1], 'base64url').toString()).role === 'service_role') leak = true; } catch { /* Not a JWT. */ }
    }
    if (leak) failures.push(file);
  }
}
await scan(process.cwd());
if (failures.length) { console.error('Credential scan failed. Inspect these files without printing their contents:', failures); process.exit(1); }
console.log(`Credential scan passed for ${scanned} source/build files. Ignored local credential files are not included in deployment.`);

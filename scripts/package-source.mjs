import { readdir, lstat, rm, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const include = ['src','public','supabase','tests','scripts','docs','.github','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','.gitignore','.env.example','README.md','sweet_lucky_draw.html'];
const excluded = new Set(['.git','.cache','.local','.temp','.branches','node_modules','artifacts']);
const files = [];
async function gather(file) {
  const name = path.basename(file);
  if (excluded.has(name) || name.startsWith('.env') && name !== '.env.example') return;
  const info = await lstat(file);
  if (info.isSymbolicLink()) throw new Error(`Source packaging refuses symbolic links: ${file}`);
  if (info.isDirectory()) { for (const entry of await readdir(file)) await gather(path.join(file,entry)); }
  else files.push(file);
}
const scan = spawnSync(process.execPath, ['scripts/check-secrets.mjs'], { encoding: 'utf8' });
if (scan.status !== 0) throw new Error(scan.stderr || scan.stdout);
for (const file of include) await gather(file);
await mkdir('artifacts', { recursive: true });
await rm('artifacts/sweet-lucky-draw-source.zip', { force: true });
// Literal newline-delimited paths are passed on stdin, not interpolated into a shell.
const result = spawnSync('zip', ['-q','artifacts/sweet-lucky-draw-source.zip','-@'], { input: files.join('\n')+'\n', encoding:'utf8' });
if (result.status !== 0) throw new Error(result.stderr);
await writeFile('artifacts/source-manifest.json', JSON.stringify({ files: files.sort(), count: files.length, includesCredentials: false },null,2)+'\n');
console.log(`Packaged ${files.length} source files. Local environment files, Git metadata, caches and generated builds are excluded.`);

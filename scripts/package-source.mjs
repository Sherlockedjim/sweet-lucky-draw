import { readdir, stat, rm, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const include = ['src','public','supabase','tests','scripts','docs','.github','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','.gitignore','.env.example','README.md','sweet_lucky_draw.html'];
const files = [];
async function gather(file) {
  if ((await stat(file)).isDirectory()) { for (const entry of await readdir(file)) await gather(path.join(file,entry)); }
  else files.push(file);
}
for (const file of include) await gather(file);
await mkdir('artifacts', { recursive: true });
await rm('artifacts/sweet-lucky-draw-source.zip', { force: true });
// Literal newline-delimited paths are passed on stdin, not interpolated into a shell.
const result = spawnSync('zip', ['-q','artifacts/sweet-lucky-draw-source.zip','-@'], { input: files.join('\n')+'\n', encoding:'utf8' });
if (result.status !== 0) throw new Error(result.stderr);
await writeFile('artifacts/source-manifest.json', JSON.stringify({ files: files.sort(), count: files.length, includesCredentials: false },null,2)+'\n');
console.log(`Packaged ${files.length} source files. Local environment files, Git metadata, caches and generated builds are excluded.`);

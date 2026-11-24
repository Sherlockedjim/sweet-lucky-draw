// Uses the user's existing gh login; no tokens or database credentials are requested.
// Creates a new PUBLIC source repository for GitHub Pages. Never overwrites an unrelated repo.
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const name = process.argv[2] || 'sweet-lucky-draw';
assert(/^[a-zA-Z0-9_.-]+$/.test(name), 'Invalid repository name');
function run(command, args, optional = false) {
  const r = spawnSync(command, args, { encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0 && !optional) throw new Error(`${command} ${args[0]} failed: ${r.error?.message || r.stderr}`);
  return r;
}
run('gh', ['auth', 'status']);
run(process.execPath, ['scripts/check-config.mjs']);
run(process.execPath, ['scripts/check-secrets.mjs']);
run('git', ['rev-parse', '--verify', 'HEAD']);
assert.equal(run('git', ['status', '--porcelain']).stdout.trim(), '', 'Commit source changes before deploying');
assert.equal(run('git', ['branch', '--show-current']).stdout.trim(), 'main', 'Deploy from main');
const account = JSON.parse(run('gh', ['api', 'user']).stdout);
const repo = `${account.login}/${name}`;
const existing = run('gh', ['repo', 'view', repo, '--json', 'nameWithOwner'], true);
const remote = run('git', ['remote', 'get-url', 'origin'], true);
const desired = `https://github.com/${repo}.git`;
if (existing.status === 0) {
  assert(remote.status === 0 && [desired, `git@github.com:${repo}.git`].includes(remote.stdout.trim()), 'Existing repository is not linked to this checkout. Refusing to overwrite it.');
} else {
  assert(remote.status !== 0, 'This checkout already has an origin. Inspect it first.');
  run('gh', ['repo', 'create', repo, '--public', '--description', 'A little luck, a lot of sweetness. React + Supabase lucky draw.']);
  run('git', ['remote', 'add', 'origin', desired]);
}
for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']) {
  run('gh', ['variable', 'set', key, '--repo', repo, '--body', process.env[key]]);
}
// This script never applies a database migration. Audit and apply it separately first.
// A new repository must have a branch before Pages can be enabled.
run('git', ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', 'push', '--set-upstream', 'origin', 'main']);
const pages = run('gh', ['api', `repos/${repo}/pages`], true);
run('gh', ['api', '--method', pages.status === 0 ? 'PUT' : 'POST', `repos/${repo}/pages`, '-f', 'build_type=workflow']);
run('gh', ['workflow', 'run', 'deploy-pages.yml', '--repo', repo, '--ref', 'main']);
console.log(`Repository: https://github.com/${repo}`);
console.log(`Actions: https://github.com/${repo}/actions`);
console.log('Push accepted. Deployment is NOT yet verified. Wait for Deploy GitHub Pages to succeed and read its returned page_url.');

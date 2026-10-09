// Isolated tarball acceptance for the opt-in entry only. No official host,
// default Bridge entry, user profile, model, agent or external MCP connection.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, cpSync, existsSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli && existsSync(npmCli), 'Run through npm run test:readonly:release');
const temp = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-readonly-package-')));
function run(args, cwd, capture = false) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', windowsHide: true,
    stdio: capture ? 'pipe' : 'inherit', timeout: 120000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'Isolated read-only package subprocess failed');
  return result.stdout;
}
try {
  const [pack] = JSON.parse(run([npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', temp], root, true));
  const paths = new Set(pack.files.map(({ path }) => path));
  for (const path of ['lib/readonly/index.js', 'lib/readonly/mcp.js', 'lib/readonly/service.js',
    'lib/types/readonly/index.d.ts', 'docs/BRI94-READONLY-MCP.md']) assert.ok(paths.has(path));
  assert.ok(pack.files.every(({ path }) => !/(^test\/|^\.ai\/|node_modules|\.env(?:\.|$)|\.(pem|key)$)/i.test(path)));
  // No peer host installation or scripts. Runtime dependencies are already in
  // npm's cache after npm ci; this acceptance does not require network access.
  run([npmCli, 'install', '--prefix', temp, '--ignore-scripts', '--legacy-peer-deps', '--offline',
    '--no-audit', '--no-fund', '--package-lock=false', join(temp, pack.filename)], temp);
  const installed = join(temp, 'node_modules/dsh-chatgpt-bridge');
  const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  assert.equal(manifest.exports['./readonly'].default, './lib/readonly/index.js');
  run(['--input-type=module', '-e', "import { inject } from 'dsh-chatgpt-bridge/readonly'; if (inject.join(',') !== 'workspaceRegistry,sessions,sessionPersistence') process.exit(1)"], temp);
  cpSync(join(root, 'test/unit/readonly-mcp.test.mjs'), join(installed, 'test/unit/readonly-mcp.test.mjs'));
  run(['--test', 'test/unit/readonly-mcp.test.mjs'], installed);
  console.log(`READONLY_PACKAGE_OK ${pack.integrity}; 35 synthetic MCP tests; no host/agent/model`);
} finally {
  const boundary = relative(realpathSync(tmpdir()), temp);
  assert.ok(boundary && !boundary.startsWith('..') && !isAbsolute(boundary));
  assert.equal(dirname(temp), realpathSync(tmpdir()));
  rmSync(temp, { recursive: true, force: true });
}

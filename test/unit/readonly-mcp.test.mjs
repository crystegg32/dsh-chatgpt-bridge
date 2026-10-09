import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ReadonlyService, LIMITS, ReadError, UPSTREAM_SHA } from '../../lib/readonly/service.js';
import { createReadonlyMcpServer, READONLY_TOOLS } from '../../lib/readonly/mcp.js';
import { apply, inject } from '../../lib/readonly/index.js';
import { startHttpServer } from '../../lib/http.js';
import { createServer } from 'node:net';

const root = resolve('synthetic-allowed');
const other = resolve('synthetic-denied');
const policy = () => ({ workspaces: [{ id: 'ws-allowed', path: root, sessionIds: ['session-a', 'session-b'] }] });
const end = (kind = 'completed', turn = 1) => ({ type: 'turn/end', data: { turn, reason: { kind } } });
const start = turn => ({ type: 'turn/start', data: { turn } });
function fixture() {
  const calls = [];
  const state = {
    header: { id: 'session-a', cwd: root, createdAt: 1 },
    events: [start(1), end(), { type: 'private-fixture', data: { text: 'PRIVATE_PROMPT_BODY', path: other } }],
    registry: [{ id: 'ws-allowed', path: root, title: 'PRIVATE_TITLE' }, { id: 'ws-denied', path: other }],
    rows: [{ header: { id: 'session-a', cwd: root } }, { header: { id: 'session-denied', cwd: other, title: 'PRIVATE_TITLE' } }],
    live: undefined,
  };
  const services = {
    workspaceRegistry: { list() { calls.push('registry.list'); return state.registry; } },
    sessions: {
      list() { calls.push('sessions.list'); return state.live ? [state.live] : []; },
      get(id) { calls.push(['sessions.get', id]); return state.live; },
    },
    sessionPersistence: {
      async list() { calls.push('persistence.list'); return state.rows; },
      async open(id, access) {
        calls.push(['open', id, access]);
        return { id, access, header: state.header,
          async read(offset, length) {
            calls.push(['read', offset, length]);
            return { eventState: 'shared-frozen', events: state.events.slice(offset, offset + length) };
          }, async close() { calls.push('close'); },
        };
      },
    },
  };
  for (const key of ['agents', 'model', 'goalStore', 'approve', 'createSession', 'sendMessage', 'resume', 'spawn', 'tunnel']) {
    Object.defineProperty(services, key, { get() { assert.fail(`Forbidden service access: ${key}`); } });
  }
  return { calls, state, services, service: new ReadonlyService(services, policy()) };
}
async function connected(service, body) {
  const client = new Client({ name: 'readonly-fixture', version: '1' });
  const server = createReadonlyMcpServer(service);
  const [left, right] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([client.connect(left), server.connect(right)]);
    await body(client);
  } finally { await client.close(); await server.close(); }
}
async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, undefined);
  const text = result.content[0].text;
  assert.ok(Buffer.byteLength(text) <= LIMITS.outputBytes);
  for (const privateText of ['PRIVATE_PROMPT_BODY', 'PRIVATE_TITLE', root, other, 'session-denied']) assert.ok(!text.includes(privateText));
  return JSON.parse(text);
}

test('readonly MCP discovers exactly four strict tools and metadata only; synthetic state unchanged', async () => {
  const f = fixture();
  const before = JSON.stringify(f.state);
  await connected(f.service, async client => {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(), [...READONLY_TOOLS].sort());
    for (const tool of tools.tools) {
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.equal(tool.inputSchema.additionalProperties, false);
    }
    assert.deepEqual(await call(client, 'dsh_health'), { status: 'ok', read_only: true, upstream_sha: UPSTREAM_SHA, host_version: 'unknown', execution_observed: false });
    assert.deepEqual(await call(client, 'dsh_list_workspaces'), { workspaces: [{ workspace_id: 'ws-allowed' }] });
    assert.deepEqual(await call(client, 'dsh_list_sessions', { workspace_id: 'ws-allowed' }), { workspace_id: 'ws-allowed', sessions: [{ session_id: 'session-a' }], has_more: false });
    assert.equal((await call(client, 'dsh_get_session_status', { workspace_id: 'ws-allowed', session_id: 'session-a' })).status, 'completed');
  });
  assert.equal(JSON.stringify(f.state), before);
  assert.ok(f.calls.some(row => Array.isArray(row) && row[0] === 'open' && row[2] === 'read'));
  assert.ok(f.calls.some(row => Array.isArray(row) && row[0] === 'read' && row[2] === LIMITS.events + 1));
  assert.equal(f.calls.at(-2), 'close');
});

test('unauthorized workspace/session fails before session body access', async () => {
  const f = fixture();
  await connected(f.service, async client => {
    for (const args of [{ workspace_id: 'ws-denied', session_id: 'session-a' }, { workspace_id: 'ws-allowed', session_id: 'session-denied' }]) {
      const result = await client.callTool({ name: 'dsh_get_session_status', arguments: args });
      assert.equal(result.isError, true);
      assert.equal(JSON.parse(result.content[0].text).error.code, 'FORBIDDEN');
    }
    const result = await client.callTool({ name: 'dsh_list_sessions', arguments: { workspace_id: 'ws-denied' } });
    assert.equal(result.isError, true);
  });
  assert.ok(!f.calls.some(row => Array.isArray(row)));
});

test('direct mutation/hidden tools and extra parameters cannot bypass the catalog', async () => {
  const f = fixture();
  await connected(f.service, async client => {
    for (const name of ['dsh_create_session', 'dsh_send_message', 'dsh_approve', 'dsh_start_goal', 'dsh_get_result', 'dsh_credential_status']) {
      assert.equal((await client.callTool({ name, arguments: {} })).isError, true);
    }
    for (const [name, args] of [
      ['dsh_health', { url: 'http://example.invalid', shell: 'PRIVATE_PROMPT_BODY' }],
      ['dsh_list_sessions', { workspace_id: 'ws-allowed', limit: 21 }],
      ['dsh_list_sessions', { workspace_id: 'ws-allowed', offset: -1 }],
      ['dsh_get_session_status', { workspace_id: 'ws-allowed', session_id: '../escape' }],
    ]) {
      const result = await client.callTool({ name, arguments: args });
      assert.equal(result.isError, true);
    }
  });
  assert.deepEqual(f.calls, []);
});

for (const change of ['header-id', 'header-cwd', 'registry-path', 'registry-duplicate']) {
  test(`exact identity rejection: ${change}`, async () => {
    const f = fixture();
    if (change === 'header-id') f.state.header.id = 'different';
    if (change === 'header-cwd') f.state.header.cwd = other;
    if (change === 'registry-path') f.state.registry[0].path = other;
    if (change === 'registry-duplicate') f.state.registry.push(f.state.registry[0]);
    await assert.rejects(f.service.sessionStatus('ws-allowed', 'session-a'), error => error instanceof ReadError && error.code === 'IDENTITY_MISMATCH');
    assert.ok(!f.calls.some(row => Array.isArray(row) && row[0] === 'read'));
    if (change.startsWith('header')) assert.equal(f.calls.at(-1), 'close');
  });
}

test('registry drift across awaited body read invalidates snapshot and closes handle', async () => {
  const f = fixture();
  const open = f.services.sessionPersistence.open;
  f.services.sessionPersistence.open = async (...args) => {
    const handle = await open(...args);
    const read = handle.read;
    handle.read = async (...range) => { const result = await read(...range); f.state.registry[0].path = other; return result; };
    return handle;
  };
  await assert.rejects(f.service.sessionStatus('ws-allowed', 'session-a'), { code: 'IDENTITY_MISMATCH' });
  assert.ok(f.calls.includes('close'));
});

test('live snapshot reads no agent and no persistence open', async () => {
  const f = fixture();
  f.state.live = { header: f.state.header, snapshotEvents: () => f.state.events };
  assert.equal((await f.service.sessionStatus('ws-allowed', 'session-a')).status, 'completed');
  assert.ok(!f.calls.some(row => Array.isArray(row) && row[0] === 'open'));
});

for (const kind of ['completed', 'error', 'aborted', 'blocked', 'interrupted', 'forked', 'max-tokens']) {
  test(`pure durable status ${kind}; never a Controller verdict`, async () => {
    const f = fixture(); f.state.events = [start(1), end(kind)];
    const result = await f.service.sessionStatus('ws-allowed', 'session-a');
    assert.equal(result.status, ({ error: 'failed', aborted: 'cancelled' })[kind] ?? kind);
    assert.equal(result.execution_observed, false);
    assert.equal('verdict' in result, false);
  });
}

test('new open turn never inherits previous completed status; wrong end turn fails', async () => {
  const f = fixture(); f.state.events = [start(1), end(), start(2)];
  assert.equal((await f.service.sessionStatus('ws-allowed', 'session-a')).status, 'unknown');
  f.state.events.push(end('completed', 1));
  await assert.rejects(f.service.sessionStatus('ws-allowed', 'session-a'), { code: 'MALFORMED_STATE' });
});

test('paging returns only configured session identities', async () => {
  const f = fixture(); f.state.rows.push({ header: { id: 'session-b', cwd: root } });
  assert.deepEqual(await f.service.listSessions('ws-allowed', 1), { workspace_id: 'ws-allowed', sessions: [{ session_id: 'session-a' }], has_more: true });
  assert.deepEqual(await f.service.listSessions('ws-allowed', 1, 1), { workspace_id: 'ws-allowed', sessions: [{ session_id: 'session-b' }], has_more: false });
  f.state.rows.push({ header: { id: 'session-b', cwd: other } });
  await assert.rejects(f.service.listSessions('ws-allowed'), { code: 'IDENTITY_MISMATCH' });
});

for (const failure of ['open', 'read', 'close', 'health']) {
  test(`safe structured ${failure} error; no raw path/secret; handle cleanup`, async () => {
    const f = fixture();
    const raw = new Error(`PRIVATE_PROMPT_BODY token=synthetic-secret ${other}`);
    const open = f.services.sessionPersistence.open;
    if (failure === 'open') f.services.sessionPersistence.open = async () => { throw raw; };
    else if (failure === 'health') f.services.sessionPersistence.list = async () => { throw raw; };
    else f.services.sessionPersistence.open = async (...args) => {
      const handle = await open(...args);
      handle[failure] = async () => { f.calls.push(failure); throw raw; };
      return handle;
    };
    await connected(f.service, async client => {
      const result = await client.callTool({ name: failure === 'health' ? 'dsh_health' : 'dsh_get_session_status', arguments: failure === 'health' ? {} : { workspace_id: 'ws-allowed', session_id: 'session-a' } });
      assert.equal(result.isError, true);
      assert.deepEqual(JSON.parse(result.content[0].text), { error: { code: 'READ_FAILED', message: 'Read-only metadata request could not be completed safely.' } });
    });
    if (failure === 'read') assert.equal(f.calls.at(-1), 'close');
    assert.ok(f.calls.filter(row => Array.isArray(row) && row[0] === 'open').length <= 1);
  });
}

test('fixed event/inventory/output budgets fail closed rather than truncate state', async () => {
  const f = fixture();
  for (const events of [Array(LIMITS.events + 1).fill(start(1)), [{ type: 'private-fixture', data: 'x'.repeat(LIMITS.eventBytes + 1) }]]) {
    f.state.events = events;
    await assert.rejects(f.service.sessionStatus('ws-allowed', 'session-a'), { code: 'LIMIT_EXCEEDED' });
  }
  f.state.rows = Array(LIMITS.inventory + 1).fill({ header: f.state.header });
  await assert.rejects(f.service.health(), { code: 'LIMIT_EXCEEDED' });
  await connected({ health: async () => ({ unsafe: 'x'.repeat(LIMITS.outputBytes + 1) }) }, async client => {
    const result = await client.callTool({ name: 'dsh_health', arguments: {} });
    assert.equal(result.isError, true);
    assert.equal(JSON.parse(result.content[0].text).error.code, 'LIMIT_EXCEEDED');
  });
});

test('invalid/duplicate policy rejected; caller policy mutation cannot expand authority', async () => {
  const f = fixture();
  for (const value of [ {}, { workspaces: [] }, { ...policy(), allowAnyRoot: true }, { workspaces: [{ ...policy().workspaces[0], path: '../escape' }] }, { workspaces: [policy().workspaces[0], policy().workspaces[0]] } ]) {
    assert.throws(() => new ReadonlyService(f.services, value), { code: 'INVALID_CONFIG' });
  }
  const p = policy(); const service = new ReadonlyService(f.services, p);
  p.workspaces[0].sessionIds.push('session-denied');
  await assert.rejects(service.sessionStatus('ws-allowed', 'session-denied'), { code: 'FORBIDDEN' });
});

test('real SDK Streamable HTTP auth and discovery over ephemeral loopback, no DSH process', async () => {
  const f = fixture();
  const token = 'readonly-fixture-token-00000000000000';
  const log = { debug() {}, info() {}, warn() {}, error() {} };
  const handle = await startHttpServer(() => createReadonlyMcpServer(f.service), { host: '127.0.0.1', port: 0, authMode: 'token', authToken: token }, log);
  const client = new Client({ name: 'readonly-http-fixture', version: '1' });
  try {
    for (const method of ['POST', 'GET', 'DELETE']) {
      const response = await fetch(handle.url, { method, headers: { authorization: 'Bearer wrong' } });
      assert.equal(response.status, 401); await response.text();
    }
    const response = await fetch(handle.url); assert.equal(response.status, 401); await response.text();
    await client.connect(new StreamableHTTPClientTransport(new URL(handle.url), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
    assert.equal((await client.listTools()).tools.length, 4);
    await call(client, 'dsh_health');
  } finally { await client.close(); await handle.close(); }
  await assert.rejects(fetch(handle.url));
});

test('separate entry refuses unsafe configuration; no hidden full lifecycle imports', () => {
  assert.deepEqual(inject, ['workspaceRegistry', 'sessions', 'sessionPersistence']);
  const ctx = new Proxy({}, { get() { assert.fail('invalid config must not access Host'); } });
  for (const config of [{}, { policy: policy(), host: '0.0.0.0' }, { policy: policy(), authMode: 'none' }]) assert.throws(() => apply(ctx, config), { code: 'INVALID_CONFIG' });
  for (const file of ['index', 'mcp', 'service']) {
    const code = readFileSync(new URL(`../../lib/readonly/${file}.js`, import.meta.url), 'utf8');
    assert.doesNotMatch(code, /from ['"].*(?:bridge\.js|goal|control\/|approval|agent)/);
    assert.doesNotMatch(code, /setInterval|setTimeout|child_process|writeFile|appendFile/);
  }
});

test('malformed events/envelope cannot turn into successful completed status', async () => {
  const f = fixture();
  await connected(f.service, async client => {
    for (const events of [[null], [end('invented')], [{ type: 'turn/end', data: {} }], [start(-1), end('completed', -1)]]) {
      f.state.events = events;
      const result = await client.callTool({ name: 'dsh_get_session_status', arguments: { workspace_id: 'ws-allowed', session_id: 'session-a' } });
      assert.equal(result.isError, true);
      assert.equal(JSON.parse(result.content[0].text).error.code, 'MALFORMED_STATE');
    }
  });
});

test('read handle identity mismatch closes without body read', async () => {
  const f = fixture(); const open = f.services.sessionPersistence.open;
  f.services.sessionPersistence.open = async (...args) => ({ ...await open(...args), id: 'wrong' });
  await assert.rejects(f.service.sessionStatus('ws-allowed', 'session-a'), { code: 'IDENTITY_MISMATCH' });
  assert.equal(f.calls.at(-1), 'close');
  assert.ok(!f.calls.some(row => Array.isArray(row) && row[0] === 'read'));
});

test('malformed status-driving events never inherit an earlier completed status', async () => {
  for (const event of [
    { type: 'approval/asked', data: { id: 'approval-1' } },
    { type: 'approval/decided', data: {} },
    { type: 'tool/call', data: { name: 'ask_user_question' } },
    { type: 'tool/result', data: { message: {} } },
    { type: 'agent/inbox/spliced', data: { target: 'next-turn', start: -1, inserted: [] } },
    { type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, inserted: [{}] } },
  ]) {
    const f = fixture(); f.state.events = [start(1), end(), event];
    await assert.rejects(f.service.sessionStatus('ws-allowed', 'session-a'), { code: 'MALFORMED_STATE' });
  }
});

test('orphan/duplicate turn ends and overlapping starts fail closed', async () => {
  for (const events of [[end()], [start(1), end(), end()], [start(1), start(2), end('completed', 2)]]) {
    const f = fixture(); f.state.events = events;
    await assert.rejects(f.service.sessionStatus('ws-allowed', 'session-a'), { code: 'MALFORMED_STATE' });
  }
});

test('valid status-driving fields retain waiting and pending semantics', async () => {
  const f = fixture();
  const approval = { type: 'approval/asked', data: { id: 'a1', toolName: 'synthetic-tool' } };
  const question = { type: 'tool/call', data: { name: 'ask_user_question', callId: 'q1', arguments: '{}' } };
  f.state.events = [start(1), end(), approval, question];
  assert.equal((await f.service.sessionStatus('ws-allowed', 'session-a')).status, 'waiting_for_approval');
  f.state.events.push({ type: 'approval/decided', data: { id: 'a1' } });
  assert.equal((await f.service.sessionStatus('ws-allowed', 'session-a')).status, 'waiting_for_user');
  f.state.events.push({ type: 'tool/result', data: { message: { source: { callId: 'q1' } } } });
  f.state.events.push({ type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, inserted: [{ id: 'm1' }] } });
  assert.equal((await f.service.sessionStatus('ws-allowed', 'session-a')).status, 'queued');
});

for (const method of ['health', 'listSessions']) {
  test(`${method} rechecks registry identity after awaited persistence read`, async () => {
    const f = fixture();
    f.services.sessionPersistence.list = async () => { f.state.registry[0].path = other; return f.state.rows; };
    await assert.rejects(f.service[method]('ws-allowed'), { code: 'IDENTITY_MISMATCH' });
  });
}

test('unexpected access mode fails closed and releases the opened handle', async () => {
  const f = fixture(); const open = f.services.sessionPersistence.open;
  f.services.sessionPersistence.open = async (...args) => ({ ...await open(...args), access: 'write' });
  await assert.rejects(f.service.sessionStatus('ws-allowed', 'session-a'), { code: 'READ_FAILED' });
  assert.equal(f.calls.at(-1), 'close');
  assert.ok(!f.calls.some(row => Array.isArray(row) && row[0] === 'read'));
});

test('shipped read-only plugin lifecycle starts only four tools; disposer closes owned listener', async () => {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const f = fixture(); const disposers = []; const logs = [];
  const envKey = 'DSH_READONLY_MCP_TEST_TOKEN'; const previous = process.env[envKey];
  const token = 'synthetic-readonly-plugin-token-000000';
  process.env[envKey] = token;
  const ctx = {
    get(key) { assert.ok(['workspaceRegistry', 'sessions', 'sessionPersistence'].includes(key)); return f.services[key]; },
    get agents() { assert.fail('no agent lookup'); },
    on() { assert.fail('no approval/question hooks'); },
    inject() { assert.fail('no secondary injection/control plane'); },
    logger: { error(text) { logs.push(text); } },
    effect(fn) { disposers.push(fn()); },
  };
  const client = new Client({ name: 'readonly-entry-fixture', version: '1' });
  try {
    apply(ctx, { port, authTokenEnv: envKey, policy: policy() });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
    assert.deepEqual((await client.listTools()).tools.map(tool => tool.name).sort(), [...READONLY_TOOLS].sort());
    await call(client, 'dsh_get_session_status', { workspace_id: 'ws-allowed', session_id: 'session-a' });
    assert.deepEqual(logs, []);
  } finally {
    await client.close(); for (const dispose of disposers) await dispose();
    if (previous === undefined) delete process.env[envKey]; else process.env[envKey] = previous;
  }
  assert.equal(disposers.length, 1);
  await assert.rejects(fetch(`http://127.0.0.1:${port}/mcp`));
});

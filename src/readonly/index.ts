/** Separate opt-in Cordis entry. Never imports the full-control plugin entry. */
import type { Context } from '@deepseek-ai/cordis';
import { z } from 'zod';
import { startHttpServer } from '../http.js';
import { createReadonlyMcpServer } from './mcp.js';
import { policySchema, ReadError, ReadonlyService, type ReadServices } from './service.js';

export { createReadonlyMcpServer } from './mcp.js';
export { ReadonlyService, ReadError, LIMITS, UPSTREAM_SHA } from './service.js';
export const name = 'dsh-readonly-mcp';
export const inject = ['workspaceRegistry', 'sessions', 'sessionPersistence'];
const configSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3457),
  authTokenEnv: z.string().regex(/^[A-Z][A-Z0-9_]{0,127}$/).default('DSH_READONLY_MCP_TOKEN'),
  policy: policySchema,
}).strict();

export function apply(ctx: Context, input: unknown): void {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) throw new ReadError('INVALID_CONFIG');
  const config = parsed.data;
  const token = process.env[config.authTokenEnv];
  if (token === undefined || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw new ReadError('INVALID_CONFIG');
  const services = {
    workspaceRegistry: ctx.get('workspaceRegistry'), sessions: ctx.get('sessions'), sessionPersistence: ctx.get('sessionPersistence'),
  } as ReadServices;
  const service = new ReadonlyService(services, config.policy);
  // No file logger, token-file generation, tunnel manager, hook or background probe.
  const log = { debug() {}, info() {}, warn() {}, error() { ctx.logger.error('Read-only MCP transport error'); } };
  const ready = startHttpServer(() => createReadonlyMcpServer(service), {
    host: '127.0.0.1', port: config.port, authMode: 'token', authToken: token,
  }, log);
  void ready.catch(() => ctx.logger.error('Read-only MCP listener unavailable'));
  ctx.effect(() => async () => {
    try { await (await ready).close(); } catch { /* Failed startup has no listener to close. */ }
  });
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { boundedResult, idSchema, LIMITS, ReadError, ReadonlyService } from './service.js';

export const READONLY_TOOLS = Object.freeze(['dsh_health', 'dsh_list_workspaces', 'dsh_list_sessions', 'dsh_get_session_status']);
export function createReadonlyMcpServer(service: ReadonlyService): McpServer {
  const server = new McpServer({ name: 'dsh-readonly-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });
  const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  function safe(handler: () => Promise<unknown>) {
    return handler().then(value => ({ content: [{ type: 'text' as const, text: boundedResult(value) }] })).catch((error: unknown) => ({
      isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: {
        code: error instanceof ReadError ? error.code : 'READ_FAILED',
        message: 'Read-only metadata request could not be completed safely.',
      } }) }],
    }));
  }
  server.registerTool('dsh_health', { description: 'Read component readiness. Does not attest task success or run an agent.', inputSchema: z.object({}).strict(), annotations }, () => safe(() => service.health()));
  server.registerTool('dsh_list_workspaces', { description: 'List only operator-allowed workspace IDs; no paths or titles.', inputSchema: z.object({}).strict(), annotations }, () => safe(() => service.listWorkspaces()));
  server.registerTool('dsh_list_sessions', { description: 'Bounded allowed session IDs in one allowed workspace; no transcript.',
    inputSchema: z.object({ workspace_id: idSchema, limit: z.number().int().min(1).max(LIMITS.rows).default(LIMITS.rows), offset: z.number().int().min(0).max(LIMITS.inventory).default(0) }).strict(), annotations },
  args => safe(() => service.listSessions(args.workspace_id, args.limit, args.offset)));
  server.registerTool('dsh_get_session_status', { description: 'Read durable session status for an exact allowed identity. No agent resume, controller reconciliation or verdict.',
    inputSchema: z.object({ workspace_id: idSchema, session_id: idSchema }).strict(), annotations },
  args => safe(() => service.sessionStatus(args.workspace_id, args.session_id)));
  return server;
}

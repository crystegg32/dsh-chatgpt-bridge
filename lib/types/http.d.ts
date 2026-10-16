import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BridgeLogger } from './log.js';
import { type RestrictedTransportAccess } from './http-context.js';
export interface HttpServerHandle {
    port: number;
    url: string;
    close(): Promise<void>;
}
export declare const MAX_MCP_BODY_BYTES: number;
export declare function startHttpServer(createSessionServer: (access: RestrictedTransportAccess) => McpServer, options: {
    host: string;
    port: number;
    authMode: 'token' | 'none';
    authToken: string;
}, log: BridgeLogger): Promise<HttpServerHandle>;

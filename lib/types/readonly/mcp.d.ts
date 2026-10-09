import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ReadonlyService } from './service.js';
export declare const READONLY_TOOLS: readonly string[];
export declare function createReadonlyMcpServer(service: ReadonlyService): McpServer;

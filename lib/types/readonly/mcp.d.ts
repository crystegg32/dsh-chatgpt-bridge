import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ReadonlyService } from './service.js';
export declare const READONLY_TOOLS: readonly string[];
/** Host-private, already authorized read capability. Never supplied by MCP input.
 * Mount only behind the existing authenticated HTTP transport. No control port.
 */
export interface ControllerReads {
    getPreview(input: {
        target_id: string;
    }): Promise<unknown>;
    getRunStatus(input: {
        target_id: string;
    }): Promise<unknown>;
}
export declare function createReadonlyMcpServer(service: ReadonlyService, controllerReads?: ControllerReads): McpServer;

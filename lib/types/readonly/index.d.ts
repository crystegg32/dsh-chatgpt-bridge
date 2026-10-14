/** Separate opt-in Cordis entry. Never imports the full-control plugin entry. */
import type { Context } from '@deepseek-ai/cordis';
export { createReadonlyMcpServer } from './mcp.js';
export type { ControllerReads } from './mcp.js';
export { ReadonlyService, ReadError, LIMITS, UPSTREAM_SHA } from './service.js';
export declare const name = "dsh-readonly-mcp";
export declare const inject: string[];
export declare function apply(ctx: Context, input: unknown): void;

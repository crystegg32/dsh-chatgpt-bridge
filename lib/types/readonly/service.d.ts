import { z } from 'zod';
import type { SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session';
import type { SessionHandle } from '@deepseek-ai/dsh-session-persistence';
export declare const UPSTREAM_SHA = "b78a575e886de1644db5273df88907bd2f2163fa";
export declare const LIMITS: Readonly<{
    outputBytes: 16384;
    rows: 20;
    inventory: 10000;
    events: 10000;
    eventBytes: 1048576;
}>;
export declare const idSchema: z.ZodString;
export declare const policySchema: z.ZodObject<{
    workspaces: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        path: z.ZodString;
        sessionIds: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type ReadPolicy = z.infer<typeof policySchema>;
export type ReadErrorCode = 'INVALID_CONFIG' | 'FORBIDDEN' | 'IDENTITY_MISMATCH' | 'READ_FAILED' | 'MALFORMED_STATE' | 'LIMIT_EXCEEDED';
export declare class ReadError extends Error {
    readonly code: ReadErrorCode;
    constructor(code: ReadErrorCode);
}
/** Narrow service interface intentionally has no agent or mutation methods. */
export interface ReadServices {
    workspaceRegistry: {
        list(): {
            id: string;
            path: string;
        }[];
    };
    sessions: {
        list(): {
            header: SessionHeader;
        }[];
        get(id: SessionId): {
            header: SessionHeader;
            snapshotEvents?: () => readonly SessionEvent[];
            events?: readonly SessionEvent[];
        } | undefined;
    };
    sessionPersistence: {
        open(id: SessionId, access: 'read'): Promise<Pick<SessionHandle, 'header' | 'id' | 'access' | 'read' | 'close'>>;
        list(): Promise<readonly (SessionHeader | {
            readonly header: SessionHeader;
        })[]>;
    };
}
export declare function boundedResult(value: unknown): string;
export declare class ReadonlyService {
    private readonly services;
    private readonly allowed;
    constructor(services: ReadServices, policy: ReadPolicy);
    private workspace;
    private identity;
    health(): Promise<{
        status: string;
        read_only: boolean;
        upstream_sha: string;
        host_version: string;
        execution_observed: boolean;
    }>;
    listWorkspaces(): Promise<{
        workspaces: {
            workspace_id: string;
        }[];
    }>;
    listSessions(workspaceId: string, limit?: number, offset?: number): Promise<{
        workspace_id: string;
        sessions: {
            session_id: string;
        }[];
        has_more: boolean;
    }>;
    sessionStatus(workspaceId: string, sessionId: string): Promise<{
        workspace_id: string;
        session_id: string;
        status: import("../status.js").BridgeStatus;
        execution_observed: boolean;
        pending: {
            next_turn: number;
            next_step: number;
        };
        waiting: {
            approvals: number;
            questions: number;
        };
    }>;
}

/** Metadata-only reads. No Bridge, agent, Goal, approval or tunnel lifecycle. */
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import { inspectPersistedSession, persistedHeader, sessionEvents } from '../session-persistence-compat.js';
import { normalizePath } from '../paths.js';
import { deriveStatus, foldPendingMessages, openAskUserQuestions, undecidedApprovals } from '../status.js';
export const UPSTREAM_SHA = 'b78a575e886de1644db5273df88907bd2f2163fa';
export const LIMITS = Object.freeze({ outputBytes: 16384, rows: 20, inventory: 10000, events: 10000, eventBytes: 1048576 });
export const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
export const policySchema = z.object({
    workspaces: z.array(z.object({
        id: idSchema,
        path: z.string().min(1).max(4096),
        sessionIds: z.array(idSchema).max(256),
    }).strict()).min(1).max(64),
}).strict();
export class ReadError extends Error {
    code;
    constructor(code) { super(code); this.code = code; }
}
function canonical(value) {
    if (typeof value !== 'string' || value.includes('\0') || !isAbsolute(value)
        || normalizePath(value) !== normalizePath(resolve(value)))
        throw new ReadError('IDENTITY_MISMATCH');
    return normalizePath(value);
}
function boundedArray(value, max) {
    if (!Array.isArray(value))
        throw new ReadError('MALFORMED_STATE');
    if (value.length > max)
        throw new ReadError('LIMIT_EXCEEDED');
    return value;
}
// Validate only fields consumed by the pure status folds. Never repair malformed
// evidence into an empty approval/question/inbox or an apparently completed turn.
const nonempty = z.string().min(1);
const statusData = {
    'approval/asked': z.object({ id: nonempty, toolName: nonempty, callId: nonempty.optional(), reason: z.string().optional() }),
    'approval/decided': z.object({ id: nonempty }),
    'tool/call': z.object({ name: nonempty, callId: nonempty, arguments: z.string() }),
    'tool/result': z.object({ message: z.object({ source: z.object({ callId: nonempty }) }) }),
    'agent/inbox/spliced': z.object({ target: z.enum(['next-turn', 'next-step']), start: z.number().int().nonnegative(),
        removedCount: z.number().int().nonnegative().optional(), inserted: z.array(z.object({ id: nonempty })) }),
};
export function boundedResult(value) {
    const text = JSON.stringify(value);
    if (Buffer.byteLength(text, 'utf8') > LIMITS.outputBytes)
        throw new ReadError('LIMIT_EXCEEDED');
    return text;
}
export class ReadonlyService {
    services;
    allowed = new Map();
    constructor(services, policy) {
        this.services = services;
        try {
            const parsed = policySchema.parse(policy);
            const paths = new Set();
            const sessions = new Set();
            for (const row of parsed.workspaces) {
                const path = canonical(row.path);
                if (this.allowed.has(row.id) || paths.has(path))
                    throw new ReadError('INVALID_CONFIG');
                paths.add(path);
                for (const id of row.sessionIds) {
                    if (sessions.has(id))
                        throw new ReadError('INVALID_CONFIG');
                    sessions.add(id);
                }
                this.allowed.set(row.id, { path, sessions: new Set(row.sessionIds) });
            }
        }
        catch {
            throw new ReadError('INVALID_CONFIG');
        }
    }
    workspace(id) {
        const rule = this.allowed.get(id);
        if (rule === undefined)
            throw new ReadError('FORBIDDEN');
        const rows = boundedArray(this.services.workspaceRegistry.list(), LIMITS.inventory).filter(row => row.id === id);
        if (rows.length !== 1 || canonical(rows[0].path) !== rule.path)
            throw new ReadError('IDENTITY_MISMATCH');
        return rule;
    }
    identity(header, id, path) {
        if (header.id !== id || canonical(header.cwd) !== path)
            throw new ReadError('IDENTITY_MISMATCH');
    }
    async health() {
        // Probe only approved workspace identity. Persistence failure is not zero/ok.
        for (const id of this.allowed.keys())
            this.workspace(id);
        boundedArray(await this.services.sessionPersistence.list(), LIMITS.inventory);
        boundedArray(this.services.sessions.list(), LIMITS.inventory);
        for (const id of this.allowed.keys())
            this.workspace(id);
        return { status: 'ok', read_only: true, upstream_sha: UPSTREAM_SHA,
            host_version: 'unknown', execution_observed: false };
    }
    async listWorkspaces() {
        return { workspaces: [...this.allowed.keys()].sort().map(id => {
                this.workspace(id);
                return { workspace_id: id };
            }) };
    }
    async listSessions(workspaceId, limit = LIMITS.rows, offset = 0) {
        if (!Number.isInteger(limit) || limit < 1 || limit > LIMITS.rows
            || !Number.isInteger(offset) || offset < 0 || offset > LIMITS.inventory)
            throw new ReadError('LIMIT_EXCEEDED');
        const rule = this.workspace(workspaceId);
        const persisted = boundedArray(await this.services.sessionPersistence.list(), LIMITS.inventory).map(persistedHeader);
        const live = boundedArray(this.services.sessions.list(), LIMITS.inventory).map(row => row.header);
        const visible = new Set();
        for (const header of [...persisted, ...live]) {
            if (!rule.sessions.has(header.id))
                continue;
            this.identity(header, header.id, rule.path);
            visible.add(header.id);
        }
        const ids = [...visible].sort();
        this.workspace(workspaceId);
        return { workspace_id: workspaceId, sessions: ids.slice(offset, offset + limit).map(session_id => ({ session_id })),
            has_more: ids.length > offset + limit };
    }
    async sessionStatus(workspaceId, sessionId) {
        const rule = this.workspace(workspaceId);
        if (!rule.sessions.has(sessionId))
            throw new ReadError('FORBIDDEN');
        const id = sessionId;
        const live = this.services.sessions.get(id);
        let header;
        let events;
        if (live !== undefined) {
            header = live.header;
            this.identity(header, sessionId, rule.path);
            events = sessionEvents(live);
        }
        else {
            // Header from the read handle is verified before reading the body.
            const persistence = this.services.sessionPersistence;
            const inspected = await inspectPersistedSession({ open: async (requested, access) => {
                    const handle = await persistence.open(requested, access);
                    return { get header() { return handle.header; }, read: async () => {
                            if (handle.access !== 'read')
                                throw new ReadError('READ_FAILED');
                            if (handle.id !== sessionId)
                                throw new ReadError('IDENTITY_MISMATCH');
                            this.identity(handle.header, sessionId, rule.path);
                            return handle.read(0, LIMITS.events + 1);
                        }, close: () => handle.close() };
                } }, id);
            header = inspected.meta;
            events = inspected.events;
        }
        this.identity(header, sessionId, rule.path);
        // Registry changes during an awaited read invalidate this snapshot.
        this.workspace(workspaceId);
        if (!Array.isArray(events))
            throw new ReadError('MALFORMED_STATE');
        if (events.length > LIMITS.events)
            throw new ReadError('LIMIT_EXCEEDED');
        let bytes = 0;
        let openTurn;
        for (const event of events) {
            bytes += Buffer.byteLength(JSON.stringify(event), 'utf8');
            if (bytes > LIMITS.eventBytes)
                throw new ReadError('LIMIT_EXCEEDED');
            if (event === null || typeof event !== 'object' || typeof event.type !== 'string')
                throw new ReadError('MALFORMED_STATE');
            if (event.type === 'turn/start' || event.type === 'turn/end') {
                if (!Number.isSafeInteger(event.data?.turn) || event.data.turn < 0)
                    throw new ReadError('MALFORMED_STATE');
                if (event.type === 'turn/end' && !['completed', 'error', 'aborted', 'blocked', 'max-tokens', 'interrupted', 'forked'].includes(event.data.reason?.kind))
                    throw new ReadError('MALFORMED_STATE');
                if (event.type === 'turn/start') {
                    if (openTurn !== undefined)
                        throw new ReadError('MALFORMED_STATE');
                    openTurn = event.data.turn;
                }
                else {
                    if (openTurn !== event.data.turn)
                        throw new ReadError('MALFORMED_STATE');
                    openTurn = undefined;
                }
            }
            if (Object.hasOwn(statusData, event.type)
                && !statusData[event.type].safeParse(event.data).success)
                throw new ReadError('MALFORMED_STATE');
        }
        // Pure upstream folds. Any malformed input fails closed in the MCP wrapper.
        const pending = foldPendingMessages(events);
        const approvals = undecidedApprovals(events).length;
        const questions = openAskUserQuestions(events).length;
        const lastStart = events.findLastIndex(event => event.type === 'turn/start');
        const lastEnd = events.findLastIndex(event => event.type === 'turn/end');
        if (lastStart >= 0 && lastEnd > lastStart
            && events[lastStart].data.turn !== events[lastEnd].data.turn)
            throw new ReadError('MALFORMED_STATE');
        const status = approvals > 0 ? 'waiting_for_approval' : questions > 0 ? 'waiting_for_user'
            : lastStart > lastEnd ? 'unknown' : deriveStatus({ live: false,
                hasPendingInbox: pending.nextTurn + pending.nextStep > 0,
                pendingApprovals: 0, pendingQuestions: 0, events });
        const allowedStatuses = ['unknown', 'queued', 'completed', 'failed', 'cancelled', 'blocked', 'max-tokens', 'interrupted', 'forked'];
        if (!['waiting_for_approval', 'waiting_for_user', ...allowedStatuses].includes(status))
            throw new ReadError('MALFORMED_STATE');
        return { workspace_id: workspaceId, session_id: sessionId, status,
            execution_observed: false, pending: { next_turn: pending.nextTurn, next_step: pending.nextStep },
            waiting: { approvals, questions } };
    }
}

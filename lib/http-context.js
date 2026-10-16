import { AsyncLocalStorage } from 'node:async_hooks';
/** Server-owned per-request scope; callers cannot mint contexts via MCP JSON. */
export function createRestrictedTransportScope(principal) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(principal))
        throw new Error('Invalid transport principal');
    const scope = new AsyncLocalStorage();
    const active = new WeakSet();
    const access = Object.freeze({
        current: () => {
            const context = scope.getStore();
            return context && active.has(context) ? context : undefined;
        },
        authenticate: (context) => typeof context === 'object' && context !== null &&
            scope.getStore() === context && active.has(context) ? principal : null,
    });
    return {
        access,
        async run(authenticated, action) {
            if (!authenticated)
                return scope.run(Object.freeze({}), action);
            const context = Object.freeze(Object.create(null));
            active.add(context);
            try {
                return await scope.run(context, action);
            }
            finally {
                active.delete(context);
            }
        },
    };
}

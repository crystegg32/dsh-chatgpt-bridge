import { AsyncLocalStorage } from 'node:async_hooks';

/** Transport trust only. Never carries a bearer, cookie or operation approval. */
export interface RestrictedTransportAccess {
  current(): object | undefined;
  authenticate(context: unknown): string | null;
}

/** Server-owned per-request scope; callers cannot mint contexts via MCP JSON. */
export function createRestrictedTransportScope(principal: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(principal)) throw new Error('Invalid transport principal');
  const scope = new AsyncLocalStorage<object>();
  const active = new WeakSet<object>();
  const access: RestrictedTransportAccess = Object.freeze({
    current: () => {
      const context = scope.getStore();
      return context && active.has(context) ? context : undefined;
    },
    authenticate: (context: unknown) => typeof context === 'object' && context !== null &&
      scope.getStore() === context && active.has(context) ? principal : null,
  });
  return {
    access,
    async run<T>(authenticated: boolean, action: () => Promise<T>): Promise<T> {
      if (!authenticated) return scope.run(Object.freeze({}), action);
      const context = Object.freeze(Object.create(null)) as object;
      active.add(context);
      try { return await scope.run(context, action); }
      finally { active.delete(context); }
    },
  };
}

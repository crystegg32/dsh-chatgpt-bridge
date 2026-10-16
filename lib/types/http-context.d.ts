/** Transport trust only. Never carries a bearer, cookie or operation approval. */
export interface RestrictedTransportAccess {
    current(): object | undefined;
    authenticate(context: unknown): string | null;
}
/** Server-owned per-request scope; callers cannot mint contexts via MCP JSON. */
export declare function createRestrictedTransportScope(principal: string): {
    access: RestrictedTransportAccess;
    run<T>(authenticated: boolean, action: () => Promise<T>): Promise<T>;
};

# BRI-94 restricted transport context — offline candidate

Base PR2: `ea7191b42f7452f3d79c7f76a6539c1007f338f4`.
Separate branch: `codex/bri94-transport-context-20261016`.
DSH admission test base: `0d6b70b19aafc223d7335ff9415d832ba9a1de0b`.

## Product change

The existing `startHttpServer` factory now receives a code-only
`RestrictedTransportAccess` argument. Existing zero-argument factories remain
compatible. No new listener, MCP server or tool registration was introduced.
Existing readonly entry still ignores this optional capability and exposes
exactly the same four/six tools according to its existing configuration.

Only **after bearer validation** on each POST/GET/DELETE does the existing HTTP
carrier enter a request scope. Its opaque object contains no fields or secrets;
`access.current()` returns it only during an active authenticated request.
`access.authenticate(context)` recognizes only that exact object's identity in
its originating active async request scope, returning the restricted transport
principal. It is not a human identity or operation approval.

- Caller JSON/header/session ID cannot mint an object identity.
- Resumed MCP sessions authenticate every HTTP request and mint fresh contexts.
- Concurrent requests, including the same MCP session, do not share contexts.
- Objects captured by delayed callbacks expire when request handling ends.
- Auth-mode `none` can still serve existing loopback readonly requests, but
  **never** creates authenticated transport authority.
- The accessor is passed to trusted server code, never MCP input/output.
  Do not expose it as a tool, serialize it, or turn its principal into a grant.

Intended private integration is the existing Host admission
`authenticate: context => access.authenticate(context)`, with trusted local
`resolveDelegation` still mandatory. No live issuer/bootstrap is installed by
this patch. All write tools remain unmounted/disabled.

## Actual tests

Windows Node22.23.2; TypeScript build PASS.

```powershell
$env:BRI94_DSH_CHECKOUT = '<exact DSH checkout>'
node --test test/unit/http-context.test.mjs test/unit/controller-readback-mcp.test.mjs test/unit/readonly-mcp.test.mjs
```

**45/45 PASS**: 3 new context tests, 7 existing optional Controller read-tool
tests, 35 existing readonly tests. The HTTP change justifies these focused
compatibility tests; no M1 real tunnel or saved R18 acceptance was repeated.
The new HTTP test uses actual Streamable HTTP client/server and the actual
DSH `createHostControlAdmission`. Its metadata-only probe obtains the real
context and reaches the original admission's `FORBIDDEN` result because no
delegation was issued. It never calls a Controller handler or creates a Run.
It tests parallel/cross-session/resumed contexts, forged principal/grant input,
invalid auth on POST/GET/DELETE, and stale/cross-request contexts.

Synthetic authentication only; readonly service/Controller-read callbacks are
fixtures. No production credential, real Host process, Qwen, Controller mutation
or external tunnel. Ephemeral loopback listeners close after tests.
Initial sandbox run had HTTP fetch failures; network-permitted loopback rerun
passed. Initial offline dependency install missed cached packages; normal
lockfile `npm ci --ignore-scripts` installed development dependencies without
changing lockfile. No dependency directory or runtime material is committed.

## Confirmed remaining blocker / stop point

DSH's actual authenticated RPC supplies one shared Operator Peer but no
attestation of a physical local user gesture. A `clicked`/`isTrusted` field in
JSON is caller-controlled. The companion installed-RC test demonstrates that
ordinary authenticated RPC and claimed-click RPC reach the same handler with
the same Peer. This patch does **not** manufacture a local approval issuer.

Minimum alternative for review: a trusted local launcher-owned confirmation
surface outside the MCP/model RPC path (for example a local Windows confirmation
dialog/console displaying the canonical manifest and explicit digest), bound
to the current Host epoch and writing only existing intake approval metadata
under existing admission. No RPC caller may supply the confirmation itself.
Actual UI/launcher ownership, ACL and same-user process threat boundary must be
reviewed and tested before implementing/claiming this issuer. Browser
`event.isTrusted` sent over RPC or Peer equality alone is not sufficient.

Until then, there is no valid approved Prepare success path and no runtime PoC
authorization request. Existing DSH intent/UNKNOWN/STOP, source/budget/lease and
Status snapshot checks remain untouched. Power-loss proof is still absent;
proposed restart behavior requires manual reconciliation and fresh epoch-bound
local confirmation, never automatic restoration of previous approvals.

# BRI-94 isolated read-only Incoming MCP candidate

## Scope and pins

This opt-in candidate is based on upstream source
`b78a575e886de1644db5273df88907bd2f2163fa` and DSH `0.2.0-rc.2`.
The inherited package version `0.6.0` is not a sufficient deployment pin:
the published upstream v0.6.0 release targeted an older host. Pin the reviewed
candidate commit and artifact integrity instead. No daily DSH installation or
ChatGPT connection is part of the offline acceptance.

The separate package entry is `dsh-chatgpt-bridge/readonly`, exporting a Cordis
plugin. **Do not install the package root or its default bundle patch for this
experiment:** those still select the upstream full-control plugin. The existing
root entry, 23-tool catalog and UI remain untouched. An isolated host must load
only the explicit read-only subpath and supply the three existing read services.
This candidate does not provide a new Supervisor, worker, agent or Controller.

## Exact tool surface

| Tool | Inputs | Output |
| --- | --- | --- |
| `dsh_health` | none | Component readiness; upstream pin; host version unknown |
| `dsh_list_workspaces` | none | Explicitly allowed workspace IDs only |
| `dsh_list_sessions` | workspace ID; limit 1–20; offset 0–10000 | Explicitly allowed session IDs; has_more |
| `dsh_get_session_status` | workspace ID; session ID | Durable status; pending/waiting counts |

All input objects reject unknown keys. Other tool names are not registered.
No transcript, source body, title, filesystem path, token, approval details,
question contents or controller verdict is returned. `execution_observed:false`
is always explicit: a durable `completed` event is not a task quality verdict,
and an open turn is `unknown`, not proof of a running worker. `health` is not an
attestation of model readiness, successful review, or completion.

## Operator policy and authentication

Example configuration for a future isolated host (synthetic values only):

```json
{
  "port": 3457,
  "authTokenEnv": "DSH_READONLY_MCP_TOKEN",
  "policy": {
    "workspaces": [{
      "id": "ws-synthetic",
      "path": "C:\\isolated\\synthetic-workspace",
      "sessionIds": ["session-synthetic"]
    }]
  }
}
```

The token must already exist in the named process environment: 32–256 URL-safe
alphanumeric, underscore or hyphen characters. The plugin neither generates nor
writes a token. Never commit actual configuration or tokens. Missing token,
invalid policy, public bind or `authMode:none` fails closed. Host is fixed to
`127.0.0.1`; the endpoint is `/mcp`; MCP data methods (POST/GET/DELETE) require
the bearer token. OPTIONS preflight returns no MCP data and uses the upstream
transport's unauthenticated preflight behavior.
No OAuth server, Tunnel binary, connection profile or public listener is created.

Policy allows at most 64 workspace identities and 256 explicitly enumerated
session IDs per workspace. Duplicate IDs or paths are rejected. Workspace
registry ID/path and session header ID/cwd must match the policy. Paths must be
absolute canonical spellings. Policy is a metadata identity binding, not a
filesystem access gateway; there is no arbitrary file-reading tool. Registry
identity is rechecked after awaited reads. Denied workspace/session requests
are rejected before session body access.

## Read boundary and fixed limits

Only `workspaceRegistry`, `sessions` and `sessionPersistence` are injected.
There is no agent lookup, approval hook, Goal reconciliation, background probe,
resume, prompt send, model execution or mutation API. Cold status uses the
upstream V3 read compatibility wrapper, opens exactly one `read` handle, verifies
handle/header identities before reading, and closes in `finally`. A legacy
unbounded inspection fallback is deliberately not enabled. Live status uses a
snapshot without querying an agent. Pure upstream folds are reused after
validating status-driving fields and turn start/end pairing. Malformed state is
an error, never fabricated empty state or inherited completion.

| Bound | Limit |
| --- | --- |
| Serialized tool output | 16 KiB UTF-8 |
| Session list page | 20 rows |
| Registry/persistence/live inventory | 10000 entries each |
| Events per status snapshot | 10000 (read requests one extra to detect overflow) |
| Serialized event data | 1 MiB |

An excess fails closed rather than truncating status evidence. These are adapter
acceptance limits, not a guarantee about upstream inventory/snapshot allocation:
existing list/snapshot APIs may materialize data before the adapter checks it.
There are no background retries. Read errors are fixed codes:
`INVALID_CONFIG`, `FORBIDDEN`, `IDENTITY_MISMATCH`, `READ_FAILED`,
`MALFORMED_STATE`, `LIMIT_EXCEEDED`. The MCP wrapper returns `isError:true`
with a generic safe reason, never a raw exception or stack. Transport logging
uses fixed categories, not request bodies or credentials.

## Offline evidence

Windows, Node 22.14.0, npm 11.6.0; dependencies installed using
`npm ci --ignore-scripts --no-audit --no-fund` in a separate worktree.

```text
npm run typecheck
npm run build
node --test test/unit/readonly-mcp.test.mjs
npm test
npm run test:release
npm run test:readonly:release
```

Focused tests use synthetic services, a native SDK client, InMemoryTransport,
and an ephemeral loopback Streamable HTTP listener. They cover exact discovery,
missing/wrong bearer authentication, rejected hidden/mutating tools, strict
schemas, private-data non-disclosure, identity drift, malformed status, quotas,
failure cleanup and the shipped plugin disposer. The synthetic service rejects
agent/model/control access. Independent review found and verified corrections
for handle cleanup, malformed status and identity drift. Final test totals and
exact candidate SHA are recorded in the PR/BRI-94 checkpoint.

Local results: typecheck/build PASS; focused 35/35 PASS; full unit suite
435 PASS, 1 existing skip, 0 failures. Isolated read-only tarball install and
all 35 packaged synthetic tests PASS, including the actual subpath import.
The upstream `test:release` official-host suite failed before readiness on this
Node 22.14.0 environment: the host's JSONL persistence imports
`node:zlib.createZstdCompress`, which this runtime does not export. No unrelated
host or engine change was made. This is not a full official-host release PASS;
a supported newer Node and isolated real-host acceptance remain separate gates.

## Account and generic client validation remain separate

The available automation browser is Codex's in-app browser. Its ChatGPT Plugins
page was logged out. This does **not** establish anything about the user's
signed-in independent Chrome account, custom MCP eligibility or Tunnel access.
No login, connection, Tunnel installation or privilege change was performed.
SDK interoperability is covered offline; actual ChatGPT account integration is
not yet accepted, and must not be represented as a Desktop-only success.

Before connecting, inspect the user's signed-in independent Chrome for custom
MCP and Tunnel functionality and verify the correct workspace/organization.
Official references:
[custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server),
[secure MCP tunnels](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).
Raw bearer transport is not OAuth. Confirm the chosen connection path can
securely supply Authorization to the loopback server before approving setup.

## Smallest future isolated live acceptance (requires approval)

1. Use a separate DSH 0.2.0-rc.2 profile with a synthetic workspace/session and
   no worker or model provider. Load only the reviewed `./readonly` entry with
   an explicit policy and separately supplied token. Do not touch daily DSH.
2. A standard MCP SDK client discovers exactly four tools. Check health, allowed
   workspace/session IDs and synthetic completed/open-turn status. Deny a sibling
   identity, unlisted session, extra argument and mutation tool; verify no state
   changes, model/agent calls or sensitive content.
3. In independent signed-in Chrome, verify account capabilities without adding
   a connection. If supported and separately approved, add one restricted
   connection/Tunnel profile using the same isolated endpoint. Confirm exactly
   four tools and repeat read-only checks. Never expose the upstream 23 tools.
4. Stop the isolated listener and remove only that connection/profile. Preserve
   daily DSH, existing browser profile and historical evidence.

This is read-only connectivity acceptance. Control, automatic triggering,
approval semantics and structured result return remain out of scope.

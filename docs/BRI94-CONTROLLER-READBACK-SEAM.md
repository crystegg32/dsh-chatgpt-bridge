# Optional Controller read capability on the existing readonly MCP

Based on reviewed readonly8340346. The default entry still registers four tools.
An optional Host-private `ControllerReads` adds `dsh_get_preview` and
`dsh_get_run_status`, both with strict `{target_id}` schemas and readonly annotations.
No new server, transport, agent, scheduler, control tool or credential mechanism.

The existing loopback bearer transport authenticates every data request. Only
trusted Host startup code may supply the capability. It must enforce exact allowed
targets, bound snapshots and sanitized output; it must not accept expected hashes,
paths, principal or authority from MCP arguments. A bearer here represents one
restricted transport principal, not per-user OAuth. Do not mount this private
capability factory on an unauthenticated transport.

Cordis opt-in: provide `dshControlReadback` before loading the readonly plugin and
set `controllerReadbackEnabled:true`. Missing capability fails configuration before
starting a listener. Default false does not look up or expose the capability.
Never use the package root/full-control entry for this experiment.

Host provider: companion `dsh-windows-local-deploy` branch
`codex/bri94-m1-integration-20261014`, based on PR18 exact45fc4ae.
`createSelectedControllerReads` applies immutable Host-selected target bindings,
requires a state-file hash for saved Run reads, and omits Preview prose/local paths.
The host still controls safe ACLs and export selection. No configuration or tokens
are committed here. Six tools were discovered on a single real authenticated
loopback MCP server; saved BRI-108 Run DONE/1session/1attempt/checkPASS/34.703s
readback passed without modifying original data. The official minimal service
fixture contains no Agent/LLM. Client/listener/Host were disposed.

Windows Node22.23.2: TypeScript build PASS; existing readonly35/35 and new optional
registration/error7/7 PASS. Cross-repo actual adapter/MCP12/12 PASS. Initial sandbox
HTTP failures were environment restrictions; native loopback tests passed.
No full-suite or new WebGPT E2E claim. Existing native probe returned tunnel429;
no connection, tunnel or account settings modified. Future native discovery/read
is WAITING_WEBGPT_CAPABILITY.

```powershell
node node_modules/typescript/bin/tsc -p tsconfig.json
node --test test/unit/readonly-mcp.test.mjs test/unit/controller-readback-mcp.test.mjs
```

Changes to `lib/` are generated JS and declaration files tracked by this existing
repository, not runtime state or bundled dependencies. No node_modules are committed.
Mutation support remains absent. Keep this Draft unmerged pending review and
separately approved native connection adoption.

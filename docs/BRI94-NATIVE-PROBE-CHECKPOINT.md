# BRI-94 native capability checkpoint — 2026-10-10

Status: **PARTIAL; not Done or a deployment/merge recommendation.**

This independent checkpoint is based on reviewed readonly candidate
`8340346f3ed606c4fcecee10d9b544368f5c4bd8`, upstream
`b78a575e886de1644db5273df88907bd2f2163fa`. Existing readonly/helper Draft PR
branches are unchanged. No Bridge/Reviewer/DSH product code or defaults change.

## Verified progress

- Separate `dsh-chatgpt-bridge/readonly` exposes four metadata-only tools:
  health, allowlisted workspaces, bounded sessions, session status. The full
  upstream 23-tool/root entry was not the acceptance surface.
- Historical synthetic account acceptance: seven expected responses, including
  two denials. Selected historical-session account acceptance: four successful
  reads and two denials. The latter is an immutable persisted snapshot, not live
  Controller/worker synchronization; `execution_observed=false` is intentional.
- Separate native pinned-GitHub advisory review and local/remote blob checks
  were recorded previously. They do not prove formal review coverage or tool
  availability in the later Bridge-created conversation.
- Offline single-attempt entry: 27 Python tests PASS (0.385s), four Node receipt
  tests PASS, independent readback PASS. Reviewers did not repeat runtime/tests.
  Existing Bridge focused regressions had 11 PASS (8.66s). These are focused
  results, not full-suite/native runtime PASS.
- Actual default offline preflight passed without constructing a driver.

The readonly product candidate's earlier 35 focused / 435 full-suite PASS plus
one existing skip, typecheck/build and installed-package evidence are separate
historical results. They were not rerun to claim this probe worked.

## One authorized native probe

Pinned Bridge: `23f165e9ba200df7735997c48427775b783414a8`.
GitHub source: `e7f19d9d977bd4c3c8dd514e56103b6c7952f6ce`.
Scope: read Linear BRI-94, at most two specified GitHub files, and call only
`dsh_health` through the isolated four-tool endpoint. No worker/task/control.

| Event | UTC time / result |
|---|---|
| Marker written before dispatch | 04:20:47.544 |
| Native-phase `dsh_health` audit | 04:21:22.593, success |
| Runner summary | 04:22:26.475, HTTP504 |
| Total elapsed | 107.412 seconds |

Exactly one native-phase health call exists. The other six audit records are
local smoke and must not be counted as native calls. Audit lacks conversation
identity: it proves a call through this connection in the probe window, not a
complete same-conversation Linear/GitHub/final receipt. Those remain unverified.

Cleanup verified: owned target absent, driver closed, ready receipt removed,
owned Tunnel/server/doctor stopped, listener/read handles closed, source unchanged,
zero workers. Parent `READY_FOR_CHATGPT` is its last readiness phase, not an
overall probe PASS. Original markers, failed summary and evidence are preserved.
The one-turn grant is **consumed**: no repeat, resend or continuation.

## What the 504 establishes

The diagnostic entry called APIServer in-process, not via the live8080 listener.
At pinned Bridge, `_error_response` maps `GenerationStuckError` to504. Source
inspection supports a local completion-detector stall classification, rather
than an HTTP socket timeout to8080. This is an inference, not a recovered error
body, specific phase, or proof the detector is incorrect.

The entry suppressed logs for privacy but failed to retain safe error phase,
submitted turn/conversation identity and projection/reconciliation metadata.
This instrumentation gap prevents distinguishing unfinished generation,
missed completed answer and CDP/observation failure. Copied Bridge logs predate
this attempt and are not its trace. No exact saved conversation identity exists
for safe readback; do not scan unrelated conversations. No deterministic defect
was established, so no speculative detector fix was made.

## Recommendation for discussion, not adopted policy

| Route | Evidence / tradeoff |
|---|---|
| Interactive native ChatGPT plus thin MCP | Recommended reference workflow: incoming native health invocation has evidence. Multi-app final receipt remains open; not unattended automation. |
| Bridge as required supervisor transport | Current result acquisition stalled. Keep optional/experimental; further reliability work belongs in Bridge scope, not more BRI-94 helper/prompt/timeout changes. |
| Local-first DSH with optional external review | Fits BRI-94 policy direction. Controller remains authority. Required review stays blocked; advisory fallback needs trusted prior policy. No control changes implemented. |
| Native/API alternative | Separately scoped candidate. Tool/account parity, entitlement, costs and unattended operation are not validated here. |

Retain the readonly MCP work. Do not build another Supervisor or make Bridge a
mandatory gate from this evidence. These are recommendations requiring a product
decision; this checkpoint implements no policy or runtime authorization.

## Diagnostic archive

See [archive README](acceptance/bri94-single-attempt/README.md). Source snapshots
and offline tests are for discussion, not installation/exports or a new test
grant. Local account launchers, snapshots, full audit/raw logs, credentials,
Tunnel/account IDs, private workspace/session identities and settings are omitted.
No runtime deployed, merge performed, issue closed or new worker started.

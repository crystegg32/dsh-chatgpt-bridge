# BRI-94 native readonly Host checkpoint — 2026-10-10

**Native isolated readonly Host integration PASS; BRI-94 overall PARTIAL.**
Independent checkpoint from16b7ab0. Reviewed readonly remains
8340346f3ed606c4fcecee10d9b544368f5c4bd8, upstream
b78a575e886de1644db5273df88907bd2f2163fa. Existing PRs/product unchanged.

## Demonstrated workflow

Manual native ChatGPT -> existing Secure MCP Tunnel -> four readonly tools ->
official isolated DSH0.2.0-rc.2 Host services. Real SessionStore, JSONL persistence,
storage hub/JSON/domain and WorkspaceRegistry; synthetic data only. No full
DSH CLI/web app, Agent/LLM/AgentLoop, Goal, approval/controller or Reviewer.
Synthetic setup writes are separate from readonly acceptance. Setup context was
disposed and official persistence/registry reloaded before reads. No daily DSH
data/settings access, worker/task or new Tunnel.

Local Host acceptance: exact four tools, five positive reads, three expected
refusals, unauthenticated HTTP401. Completed durable state=completed, open durable
turn=unknown, execution_observed=false. Data tree hash unchanged across reads;
no attached Session/Agent activation; handles/listener/Host closed. Windows
Node24.19.0, official installed reference packages0.2.0-rc.2.

## Final native receipt

Test: BRI94-FINAL-HOST-20261010-03. Operator elapsed35s.

| Planned call | Actual result |
| --- | --- |
| dsh_health | ok, read_only=true |
| dsh_list_workspaces | One allowed workspace |
| dsh_list_sessions | Two allowed sessions |
| dsh_get_session_status, completed fixture | completed, execution_observed=false |
| dsh_get_session_status, open fixture | unknown, execution_observed=false |

Server audit corroborates the planned sequence13:06:56.974–13:07:21.756 UTC;
tool span24.782s is separate from operator overall35s. Audit has **six** native
rows, including an earlier successful health at13:06:40.841 UTC. Read-only app
metadata shows a separate prior health-only chat followed by the matching final
test request. Do not omit the extra call, report five total, or label automatic
retry. Audit has no conversation ID: operator results plus matching request and
phase-labelled audit corroborate the receipt, not per-call machine identity
binding or timestamp proximity alone. No native error rows.

Health host_version=unknown is retained; installed package version is separate
evidence. No result proves worker execution. Owned server/client/doctor stopped
13:08:08.441 UTC (21:08:08.441 Taiwan). Host disposed, listener closed, read
handles4/4 closed, source unchanged. Parent READY status is a readiness phase;
the separate final result is PASS. Existing connection/settings/history retained.

Earlier manual Linear and fixed-SHA GitHub reads succeeded per operator report,
but that combined request was sent144.075s after service shutdown. Its PARTIAL
result is preserved. Separate successful tests do not rewrite it into a full
single-conversation Linear/GitHub/DSH PASS. Earlier Bridge probe504 remains
unresolved; manual acceptance bypasses Bridge, not repairs it.

## Local preparation-entry repair

Initial entry failed before account connection: registry backslashes were
normalized to slashes on only one comparison side, while Windows path.join
produced backslashes on the expected side. Identical paths therefore failed.
A later explicit offline repair grant reused existing pathsEqual on both sides.
No core/allowlist/identity/hash/service guard was loosened.

See [repair archive](acceptance/bri94-native-host/README.md) and
[minimal hunk](acceptance/bri94-native-host/entry-path-fix.patch). Windows
Node24.19.0 path regressions3/3 PASS (95.9766ms), including parent/sibling/other
profile rejection. One newly authorized local-only preflight passed: five
positive reads/three refusals, local doctor, source unchanged, handles2/2 closed,
all services stopped. No account call during offline repair. Original failed
preflight and STOP evidence remain intact.

Readonly product35 focused/435 full +one skip, typecheck/build are separate
historical results. No tests/account calls repeated or full CI claimed for this
documentation publication.

## Distance to BRI-94 completion

| Issue gate | Current state / remaining work |
| --- | --- |
| Native Linear/GitHub and incoming readonly MCP | Individually demonstrated; final DSH-only native Host integration PASS |
| Same-conversation issue read + successful DSH call | Original combined attempt PARTIAL; no more connectivity tests under closed grant |
| Bridge final receipt / continuation | Earlier504 unresolved; adoption of manual scope needs explicit criteria decision |
| Minimal DSH control | Not implemented/accepted; first map existing Controller authority, no second Supervisor |
| Isolated start -> run identity -> status | Not executed; needs separately scoped control implementation and bounded mutation/model authorization |
| Reviewer/revise E2E | Not integrated; retain Reviewer readonly and trustworthy checkpoint/coverage contract |
| Unattended trigger / result import | Unverified; incoming Tunnel does not start ChatGPT conversations or authorize results |
| Cost/policy boundary | Interaction entitlement observed; future cost/automation and advisory|required policy unverified |

The issue's minimal first-stage success still needs an isolated start operation
and status query tied to run identity, alongside native issue read in one
workflow. Broader Phase C adds bounded work and checkpoint review/revise. This
is more than health testing. Recommend next scoped offline Controller-boundary
design with exact issue/workspace/run/checkpoint identities and uncertain-send
handling. Publication does not authorize implementation, controls or runtime.

## Stop and publication boundary

Final run closed: no further test grant. De-identified results and repair hunk
only; credentials, Tunnel/account IDs, absolute local paths, conversation IDs,
full logs/raw source/model output, local launchers/settings and media stay local.
BRI-94 remains In Progress/PARTIAL; BRI-104/106 unchanged. No deployment,
merge or Done recommendation. Original16b7ab0 history remains intact.

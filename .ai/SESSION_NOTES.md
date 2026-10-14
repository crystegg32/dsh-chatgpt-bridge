# Session notes — 2026-10-10

Single writer in an isolated upstream worktree; original helper PR #8 remains
Draft and untouched. Implemented only the explicitly approved read-only scope.

Independent review corrected read-handle cleanup, malformed status evidence and
workspace identity drift across awaits. Latest working-diff review PASS and 35
focused tests PASS. Full suite: 435 PASS, 1 existing skip, 0 failures.
Typecheck/build PASS; isolated read-only tarball install plus 35 synthetic tests
PASS. Upstream full official-host release suite is blocked on Node 22.14.0's
missing Zstd API; no unrelated host/runtime change attempted. Exact commit
readback follows in the external checkpoint; do not infer live ChatGPT/DSH
acceptance from this.

No source text, session transcript, token or actual operator configuration stored.
Only synthetic services and temporary localhost listeners were exercised.
The original package root remains upstream full-control; future isolated loading
must explicitly select `dsh-chatgpt-bridge/readonly`.

## 2026-10-14 Codex — BRI-94 readonly integration and offline control preparation

### Summary
- Local saved-data readonly HTTP MCP PASS; WebGPT native capability pending429.
### Changed
- Optional two-tool seam and trusted selected snapshot provider; M2 pure request plan, no control activation.
### Tested
- Windows Node22.23.2: existing bridge35/35, bridge seam7/7, cross-repo12/12, offline request13/13. Actual BRI-108 saved data unchanged; owned listener/Host stopped.
### Next
- Independent Draft review; separately authorize existing isolated connection discovery and concrete shared Host admission integration.
### Needs verification
- Native WebGPT new-tool calls, account write permissions, Bridge continuation and live control; no deployment or model performed.

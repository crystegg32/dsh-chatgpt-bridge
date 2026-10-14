# Current tasks

BRI-94: isolated no-model Incoming MCP candidate. Based on upstream exact
`b78a575e886de1644db5273df88907bd2f2163fa`; branch `codex/bri-94-readonly-mcp`.

- Separate `./readonly` export; four metadata-only tools.
- Reuse MCP transport and V3 persistence read compatibility; no full Bridge lifecycle.
- Windows synthetic MCP tests and independent review; final totals in PR/Linear.
- Next gate: reviewed exact commit, isolated real host/standard client, then
  independent Chrome account check and separately authorized connection setup.
- No daily installation, new Tunnel, worker/model, deployment or merge authorized.
- Account capability unknown; logged-out in-app browser is not evidence about
  independent Chrome or a generic MCP client's compatibility.

See `docs/BRI94-READONLY-MCP.md` for boundaries and the minimal acceptance plan.

## Last close

2026-10-14 Codex: BRI-94 M1 local readonly integration PASS; optional same-server two-tool seam, real saved BRI-108 DONE readback, no state changes. Windows Node22.23.2: bridge35+7, cross-repo12, M2 planner13 tests PASS. Current native tunnel probe429; WebGPT E2E unverified. M2 pure request planning only; concrete shared Host delegation/admission and account write capability remain gates. No model/Controller mutation/Linear write/daily/main/connection changes. See docs/BRI94-M1-M2-CHECKPOINT-20261014.md.

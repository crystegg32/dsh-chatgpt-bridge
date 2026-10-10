# Decision log

## 2026-10-10 — preserve probe without extending runtime experiments

Record evidence and diagnostics in a separate branch from reviewed readonly
`8340346`; preserve existing Draft PR branches and operator evidence. Gate is
PARTIAL: native health invocation has evidence but multi-app/final receipt does
not. No sends under consumed authorization. Interactive-native/local-first
direction is a recommendation, not adopted Controller policy or worker permission.

## 2026-10-10 — close native readonly Host acceptance, retain control gap

Final manual native incoming readonly Host gate PASS with official isolated
services, synthetic persisted data and no Agent/model. Preserve all historical
failures and the extra health-call disclosure. Audit lacks per-call conversation
identity; do not combine separate successes into a full multi-app PASS.
Publish entry path repair/evidence only on an independent branch from16b7ab0.
No more connectivity tests under closed grants. Existing Controller design and
isolated start/run/status require next scope; no control authorization inferred.

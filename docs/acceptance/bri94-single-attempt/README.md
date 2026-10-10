# Archived BRI-94 single-attempt diagnostics

**For review and offline discussion only. Not a reusable execution grant.**
The original probe authorization was consumed. Never run `--execute` from this
copy, create a ready receipt, change/delete markers or use it to justify another
conversation. Path-based once markers are trusted-launcher controls, not
cryptographic permission.

These files are unchanged snapshots of the reviewed local diagnostic candidate.
They reference the verified Windows layout and an external exact Bridge checkout;
they are not a portable generic test suite. They are outside npm package files
and exports. Original local files retain their consumed marker/failure evidence.

| Files | Purpose |
|---|---|
| `single_attempt_adapter.py` + test | Instance-local clone retains original method code; existing retry helper max_attempts=1, streaming refused. No product/global patch. |
| `admission.py` + test | Fixed hash, strict envelope, auth/config drift rejection, fresh server, exclusive consumed marker before dispatch. |
| `execution.py` + test | Exact source/module checks, original handler/locks, owned driver cleanup, metadata-only results. |
| `run_probe.py` + test | Default offline preflight; fixed capability scope. Execution prohibited for this archive. |
| `once-ready-receipt.mjs` + test | Receipt ownership, pending-write/stop, foreign-file protection, local-summary stop trigger. |

Original Windows acceptance environment offline commands:

```powershell
python -m unittest test_single_attempt_adapter test_admission test_execution test_run_probe -q
node --test once-ready-receipt.test.mjs
```

Tests use fake drivers/services/locks/requests, without account/ChatGPT access.
Python imports/dependencies require the pinned Bridge environment; Node receipt
tests are standalone. Do not use the execute path as an installation smoke.

Publication-copy verification on Windows Python3.13.11 / Node24.19.0:
27 Python tests PASS (0.458s), four Node tests PASS (100.1ms). Source hashes in
`source-provenance.json` were checked against the reviewed local originals.

## Limits

- One factory invocation plus a trusted fixed restart marker, not network
  exactly-once, power-loss durability or defense against local file changes.
- Private no-listener config copy retains configured keys or adds ephemeral
  local auth if absent. No operator settings or profile are written.
- Checks cover current HEAD, clean disk/module paths and source text (Python
  universal newlines only), not arbitrary runtime-memory attestation.
- `driver.close()` return alone is insufficient. One bounded direct localhost
  CDP read verifies target absence, with proxies/redirects disabled.
- Text response does not prove native calls. Audit/receipts and the required
  identity/coverage contract remain necessary.
- Error diagnostics were insufficient in the consumed attempt: no error phase
  or failed-turn identity. This archive is not a root-cause fix.

The local account harness/operator launcher is not included: it depends on
operator paths, hidden credential entry and an approved private persisted-session
snapshot. This directory alone is not an account E2E launcher.

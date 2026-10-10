"""Operator entry. Default is OFFLINE preflight; --execute requires live gate.

Never starts Chrome or Tunnel. Readiness must be established separately.
"""
import argparse
import asyncio
import copy
import hashlib
import json
import logging
import secrets
import sys
from pathlib import Path

from execution import SOURCE, ROOT, MARKER, SUMMARY, verify_source, execute
from admission import FrozenRequest, body_hash, SingleAttemptPolicyError

# Fixed capability-only scope approved in PHASE-A-GATE-DECISION-20261010.md.
# Instructions are source configuration; no runtime prompt is written to evidence.
def probe_body():
    text = (
        'Use only native tools for one bounded capability check. Read Linear BRI-94. '
        'From crystegg32/ChatGPT-Web2API at exact '
        'e7f19d9d977bd4c3c8dd514e56103b6c7952f6ce, read only '
        'src/chatgpt_web2api/turn_anchor.py lines 450-565 and '
        'tests/test_projection_observation_reliability.py. '
        "Call the connected four-tool read-only endpoint's dsh_health once. "
        'If a required tool is unavailable, report that and stop. '
        'Do not start tasks, models or workers, change settings, invoke any mutation '
        'or Reviewer, retry tools, or read other files. Report tools that actually '
        'succeeded, source SHA/ranges and unavailable capabilities; do not fabricate '
        'calls or infer success from names. This is not a code-quality verdict.'
    )
    return {'messages': [{'role': 'user', 'content': text}], 'model': 'auto', 'stream': False}


def load_runtime():
    verify_source()
    sys.path.insert(0, str(SOURCE / 'src'))
    from chatgpt_web2api.config import Config
    from chatgpt_web2api.api_server import APIServer
    from chatgpt_web2api.cdp_driver import CDPDriver
    verify_source()
    config = Config.load()
    if config.chrome.cdp_port != 9222 or config.chatgpt.tab_mode != 'owned':
        raise SingleAttemptPolicyError('CONFIG_NOT_AUTHORIZED')
    if config.chatgpt.default_project_id is not None:
        raise SingleAttemptPolicyError('PROJECT_CONTEXT_REQUIRES_REVIEW')
    # Private in-process request, no HTTP listener. Retain operator keys if set;
    # otherwise harden only the ephemeral copy, without writing settings.
    isolated = copy.deepcopy(config)
    if not isolated.server.api_keys:
        isolated.server.api_keys = [secrets.token_urlsafe(32)]
    return isolated, APIServer, CDPDriver


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--tunnel-ready-receipt', type=Path)
    args = parser.parse_args()
    logging.disable(sys.maxsize)
    try:
        config, server_factory, driver_factory = load_runtime()
        if MARKER.exists() or SUMMARY.exists():
            raise SingleAttemptPolicyError('ATTEMPT_ALREADY_RECORDED')
        body = probe_body()
        # Preflight verifies config/auth/body without constructing a CDP driver.
        from admission import auth_keys
        keys = auth_keys(config)
        if not args.execute:
            print(json.dumps({'result': 'OFFLINE_PREFLIGHT_PASS',
                              'request_sha256': body_hash(body), 'send_started': False}))
            return 0
        # Receipt is a local trusted-operator prerequisite, NOT proof of tool access.
        # No receipt is created by this entry; old connection artifacts cannot pass.
        receipt = json.loads(args.tunnel_ready_receipt.read_text(encoding='utf-8'))
        if (set(receipt) != {'purpose', 'request_sha256', 'ready'}
                or receipt != {'purpose': 'bri94-native-capability-once',
                               'request_sha256': body_hash(body), 'ready': True}):
            raise SingleAttemptPolicyError('TUNNEL_READY_REQUIRED')
        request = FrozenRequest(body, type('Headers', (), {
            'headers': {'Authorization': 'Bearer ' + keys[0]}, 'query': {}})())
        driver = driver_factory(cdp_port=9222, tab_mode='owned',
                                instance_id='bri94-native-capability-once',
                                parallel_tabs=config.chatgpt.parallel_tabs)
        result = asyncio.run(execute(config, driver, server_factory, request, body_hash(body)))
        print(json.dumps(result, sort_keys=True))
        return 0 if result['classification'] == 'response_received' else 1
    except BaseException:
        # Do not echo exception text, config, paths or raw outputs.
        print('STOPPED: PREFLIGHT_OR_EXECUTION_FAILED')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())

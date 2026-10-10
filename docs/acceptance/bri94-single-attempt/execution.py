"""Isolated one-turn runner. Does not start Chrome, a listener or Tunnel.

Call only after the separately owned native Tunnel is ready. Fixed marker is
never removed. Do not expose the server app. No raw response is persisted.
"""
import asyncio
import copy
import hashlib
import json
import logging
import subprocess
import sys
import time
import uuid
from pathlib import Path
from urllib.request import build_opener, ProxyHandler, HTTPRedirectHandler

from admission import Admission, FrozenRequest, body_hash, SingleAttemptPolicyError

SOURCE = Path('X:/dev/worktrees/bridge-cdp-timeout-diagnostics')
SHA = '23f165e9ba200df7735997c48427775b783414a8'
ROOT = Path(__file__).resolve().parent
MARKER = ROOT / 'native-capability-turn.consumed.json'
SUMMARY = ROOT / 'native-capability-turn.summary.json'


def same_python_source(actual, expected):
    # Python uses universal newlines. Windows git checkout may use CRLF while
    # git show emits LF; no stripping or other content normalization is allowed.
    return actual.replace('\r\n', '\n').replace('\r', '\n') == expected.replace('\r\n', '\n').replace('\r', '\n')


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def target_absent(target_id):
    # One bounded local-CDP metadata read, never a ChatGPT request or polling.
    opener = build_opener(ProxyHandler({}), NoRedirect())
    with opener.open('http://127.0.0.1:9222/json/list', timeout=3) as response:
        if response.status != 200:
            raise SingleAttemptPolicyError('TARGET_LIST_HTTP_ERROR')
        raw = response.read(1024 * 1024 + 1)
    if len(raw) > 1024 * 1024:
        raise SingleAttemptPolicyError('TARGET_LIST_TOO_LARGE')
    targets = json.loads(raw)
    if not isinstance(targets, list) or any(not isinstance(t, dict) or not isinstance(t.get('id'), str) for t in targets):
        raise SingleAttemptPolicyError('INVALID_TARGET_LIST')
    return not any(t['id'] == target_id for t in targets)


def freeze_request(request, expected_hash, server):
    if server._check_auth(request) is not None:
        raise SingleAttemptPolicyError('AUTH_REQUIRED')
    async def freeze():
        try:
            body = json.loads(json.dumps(await request.json(), allow_nan=False))
            messages = body['messages']
            valid = (set(body) == {'messages', 'model', 'stream'}
                     and body['model'] == 'auto' and body['stream'] is False
                     and isinstance(messages, list) and len(messages) == 1
                     and set(messages[0]) == {'role', 'content'}
                     and messages[0]['role'] == 'user'
                     and isinstance(messages[0]['content'], str)
                     and 0 < len(messages[0]['content'].encode('utf-8')) <= 16384
                     and body_hash(body) == expected_hash)
        except (ValueError, TypeError, KeyError, IndexError, UnicodeError):
            valid = False
        if not valid:
            raise SingleAttemptPolicyError('REQUEST_NOT_AUTHORIZED')
        return FrozenRequest(body, request)
    return freeze()


def verify_source(source=SOURCE):
    def git(*args):
        return subprocess.check_output(['git', '-C', str(source), *args],
                                       stderr=subprocess.DEVNULL)
    try:
        if git('rev-parse', 'HEAD').decode().strip() != SHA or git('status', '--porcelain').strip():
            raise SingleAttemptPolicyError('SOURCE_NOT_PINNED')
        package = (source / 'src/chatgpt_web2api').resolve()
        for name, module in list(sys.modules.items()):
            if name == 'chatgpt_web2api' or name.startswith('chatgpt_web2api.'):
                path = Path(module.__file__).resolve()
                if not path.is_relative_to(package) or path.suffix != '.py':
                    raise SingleAttemptPolicyError('MODULE_NOT_PINNED')
                relative = path.relative_to(source.resolve()).as_posix()
                if not same_python_source(path.read_text(encoding='utf-8'),
                                          git('show', SHA + ':' + relative).decode('utf-8')):
                    raise SingleAttemptPolicyError('MODULE_NOT_PINNED')
    except (OSError, subprocess.SubprocessError, AttributeError, TypeError, UnicodeError):
        raise SingleAttemptPolicyError('SOURCE_CHECK_FAILED') from None


def classify_response(response):
    """Metadata only. A text response is NOT proof native tools executed."""
    result = {'http_status': response.status, 'classification': 'http_error',
              'native_tool_execution': 'unverified'}
    if response.status != 200:
        if response.status == 429: result['classification'] = 'rate_limit'
        elif response.status == 504: result['classification'] = 'timeout'
        return result
    try:
        payload = json.loads(response.body)
        content = payload['choices'][0]['message']['content']
        if not isinstance(content, str) or not content.strip():
            raise ValueError()
        result.update(classification='response_received',
                      response_utf8_bytes=len(content.encode('utf-8')),
                      response_sha256=hashlib.sha256(content.encode('utf-8')).hexdigest())
        conversation = payload.get('conversation_id')
        if isinstance(conversation, str):
            try:
                result['conversation_id'] = str(uuid.UUID(conversation))
            except ValueError:
                pass
    except (ValueError, TypeError, KeyError, IndexError, UnicodeError):
        result['classification'] = 'invalid_response'
    return result


async def execute(config, driver, server_factory, request, expected_hash,
                  marker=MARKER, summary=SUMMARY, source_check=verify_source,
                  target_check=target_absent):
    """Internal dependency injection is for offline tests, not alternate backends."""
    started = time.monotonic()
    before = copy.deepcopy(config)
    metadata = {'bridge_sha': SHA, 'classification': 'not_dispatched',
                'native_tool_execution': 'unverified', 'driver_closed': False}
    # No raw exception logging: upstream logs may include text or local paths.
    previous_logging = logging.root.manager.disable
    logging.disable(sys.maxsize)
    try:
        source_check()
        if Path(marker).exists() or Path(summary).exists():
            raise SingleAttemptPolicyError('ATTEMPT_ALREADY_RECORDED')
        if (config.chrome.cdp_port != 9222 or config.chatgpt.tab_mode != 'owned'
                or config.chatgpt.default_project_id is not None):
            raise SingleAttemptPolicyError('CONFIG_NOT_AUTHORIZED')
        gate = Admission(server_factory(config, driver), marker, expected_hash)
        # Do not permit an invalid request to attach Chrome or create a tab.
        # Gate will repeat auth/hash validation immediately before dispatch.
        request = await freeze_request(request, expected_hash, gate._server)
        await driver.connect()
        if not driver._owns_target:
            raise SingleAttemptPolicyError('OWNED_TARGET_REQUIRED')
        source_check()
        if config != before:
            raise SingleAttemptPolicyError('CONFIG_CHANGED')
        response = await gate.invoke(request)
        metadata.update(classify_response(response))
    except asyncio.CancelledError:
        metadata['classification'] = 'cancelled_delivery_unknown'
        raise
    except Exception as error:
        metadata['classification'] = ('policy_stop' if isinstance(error, SingleAttemptPolicyError)
                                      else 'execution_error_delivery_unknown')
    finally:
        owned = getattr(driver, '_owns_target', False)
        target_id = getattr(driver, '_target_id', None)
        try:
            await driver.close()
            metadata['close_returned'] = True
            if owned:
                if not isinstance(target_id, str) or not target_id or not target_check(target_id):
                    raise SingleAttemptPolicyError('OWNED_TARGET_CLEANUP_UNVERIFIED')
                metadata['target_cleanup'] = 'verified_absent'
            else:
                metadata['target_cleanup'] = 'no_owned_target'
            metadata['driver_closed'] = True
        except BaseException:
            metadata['classification'] = 'cleanup_failed'
            metadata['target_cleanup'] = 'unverified'
        metadata['elapsed_seconds'] = round(time.monotonic() - started, 3)
        metadata['marker_exists'] = Path(marker).exists()
        logging.disable(previous_logging)
        # Exclusive summary: never overwrite prior evidence even on a denied rerun.
        try:
            with Path(summary).open('x', encoding='utf-8') as stream:
                json.dump(metadata, stream, sort_keys=True)
        except FileExistsError:
            pass  # Original evidence preserved; denied rerun is returned in memory.
    return metadata

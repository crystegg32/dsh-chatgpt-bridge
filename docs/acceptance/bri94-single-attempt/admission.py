"""Offline invocation gate. No listener, Chrome startup or credentials handling.

Only invoke() is an admitted entry. Never expose server.app or _handle_chat.
The caller must supply an independently reviewed, fixed request hash and marker.
"""
import hashlib
import json
import os
from pathlib import Path

from single_attempt_adapter import prepare_single_attempt_instance, SingleAttemptPolicyError


def body_hash(body):
    return hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=True,
                                    separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def auth_keys(config):
    keys = config.server.api_keys
    if (not isinstance(keys, (list, tuple)) or not keys
            or any(not isinstance(key, str) or not key.strip() for key in keys)):
        raise SingleAttemptPolicyError('AUTH_REQUIRED')
    return tuple(keys)


class FrozenRequest:
    def __init__(self, body, request):
        self._body = body
        self.headers = dict(request.headers)
        self.query = dict(request.query)

    async def json(self):
        return self._body


class Admission:
    def __init__(self, server, marker, expected_hash):
        keys = auth_keys(server._config)
        if (len(expected_hash) != 64 or any(c not in '0123456789abcdef' for c in expected_hash)
                or server._request_count != 0 or server._last_conv_id is not None
                or server._last_successful_send_at is not None):
            raise SingleAttemptPolicyError('INVALID_ADMISSION_CONFIGURATION')
        self._server = prepare_single_attempt_instance(server)
        self._keys = keys
        self._marker = Path(marker)
        self._hash = expected_hash
        self._used = False

    async def invoke(self, request):
        # Original auth is checked before even parsing or consuming the grant.
        if auth_keys(self._server._config) != self._keys:
            raise SingleAttemptPolicyError('AUTH_REQUIRED')
        error = self._server._check_auth(request)
        if error is not None:
            return error
        try:
            # Defensive copy: request cannot change after validation.
            body = json.loads(json.dumps(await request.json(), allow_nan=False))
            messages = body['messages']
            valid = (set(body) == {'messages', 'model', 'stream'}
                     and body['model'] == 'auto' and body['stream'] is False
                     and isinstance(messages, list) and len(messages) == 1
                     and set(messages[0]) == {'role', 'content'}
                     and messages[0]['role'] == 'user'
                     and isinstance(messages[0]['content'], str)
                     and 0 < len(messages[0]['content'].encode('utf-8')) <= 16384
                     and body_hash(body) == self._hash)
        except (ValueError, TypeError, KeyError, IndexError, UnicodeError):
            valid = False
        if not valid:
            raise SingleAttemptPolicyError('REQUEST_NOT_AUTHORIZED')
        if auth_keys(self._server._config) != self._keys:
            raise SingleAttemptPolicyError('AUTH_REQUIRED')
        if (self._server._config.chatgpt.default_project_id is not None
                or self._server._request_count != 0 or self._server._last_conv_id is not None
                or self._server._last_successful_send_at is not None):
            raise SingleAttemptPolicyError('SERVER_NOT_FRESH')
        if self._used:
            raise SingleAttemptPolicyError('ATTEMPT_ALREADY_CONSUMED')
        self._used = True  # No await until exclusive marker is durably closed.
        try:
            fd = os.open(self._marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except OSError:
            raise SingleAttemptPolicyError('MARKER_UNAVAILABLE') from None
        # Errors, cancellations and process restart never remove the marker.
        with os.fdopen(fd, 'w', encoding='ascii') as stream:
            stream.write(json.dumps({'version': 1, 'request_sha256': self._hash,
                                     'state': 'consumed_before_dispatch'}))
            stream.flush()
            os.fsync(stream.fileno())
        return await self._server._handle_chat(FrozenRequest(body, request))

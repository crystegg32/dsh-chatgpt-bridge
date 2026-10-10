import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from test_single_attempt_adapter import Driver, server
from admission import Admission, body_hash, SingleAttemptPolicyError

BODY = {'messages': [{'role': 'user', 'content': 'SYNTHETIC'}],
        'model': 'auto', 'stream': False}


class Request:
    headers = {'Authorization': 'Bearer synthetic'}
    query = {}

    def __init__(self, body=BODY):
        self.body = body

    async def json(self):
        return self.body


class NoopLock:
    def __init__(self, *args): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *args): pass


class Tests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.marker = Path(self.tmp.name) / 'once.json'

    def make(self, error=None):
        d = Driver(error)
        d.navigate_new_chat = AsyncMock()
        s = server(d)
        s._config.server.api_keys = ['synthetic']
        return d, s, Admission(s, self.marker, body_hash(BODY))

    async def test_real_handler_once_concurrent_and_restart(self):
        d, s, gate = self.make()
        with patch('chatgpt_web2api.api_server.MutationLock', NoopLock):
            results = await asyncio.gather(gate.invoke(Request()), gate.invoke(Request()),
                                           return_exceptions=True)
        self.assertEqual(sum(getattr(x, 'status', None) == 200 for x in results), 1)
        self.assertEqual(d.calls, 1)
        d.navigate_new_chat.assert_awaited_once()
        d2, _, gate2 = self.make()
        with self.assertRaises(SingleAttemptPolicyError): await gate2.invoke(Request())
        self.assertEqual(d2.calls, 0)
        d2.navigate_new_chat.assert_not_called()
        record = json.loads(self.marker.read_text())
        self.assertEqual(set(record), {'version', 'request_sha256', 'state'})

    async def test_denied_auth_and_body_never_navigate_or_consume(self):
        d, s, gate = self.make()
        bad = Request(); bad.headers = {}
        self.assertEqual((await gate.invoke(bad)).status, 401)
        for body in [None, [], {}, {**BODY, 'stream': True},
                     {**BODY, 'conversation_id': 'old'},
                     {**BODY, 'model': 'other'},
                     {**BODY, 'messages': [{'role': 'user', 'content': 'changed'}]}]:
            with self.assertRaises(SingleAttemptPolicyError):
                await gate.invoke(Request(body))
        self.assertFalse(self.marker.exists())
        d.navigate_new_chat.assert_not_called()

    async def test_errors_and_cancellation_consume_marker(self):
        for error in [TimeoutError('synthetic'), asyncio.CancelledError()]:
            self.marker = Path(self.tmp.name) / type(error).__name__
            d, s, gate = self.make(error)
            with patch('chatgpt_web2api.api_server.MutationLock', NoopLock):
                if isinstance(error, asyncio.CancelledError):
                    with self.assertRaises(asyncio.CancelledError): await gate.invoke(Request())
                else:
                    self.assertEqual((await gate.invoke(Request())).status, 500)
            self.assertTrue(self.marker.exists())
            with self.assertRaises(SingleAttemptPolicyError): await gate.invoke(Request())
            self.assertEqual(d.calls, 1)

    async def test_config_drift_and_marker_failure_fail_closed(self):
        d, s, gate = self.make()
        s._config.chatgpt.default_project_id = 'not-approved'
        with self.assertRaises(SingleAttemptPolicyError): await gate.invoke(Request())
        s._config.chatgpt.default_project_id = None
        with patch('admission.os.open', side_effect=PermissionError('sensitive')):
            with self.assertRaisesRegex(SingleAttemptPolicyError, '^MARKER_UNAVAILABLE$'):
                await gate.invoke(Request())
        d.navigate_new_chat.assert_not_called()
        with self.assertRaises(SingleAttemptPolicyError): await gate.invoke(Request())

    async def test_auth_disabled_initially_or_after_construction_is_denied(self):
        d = Driver()
        for keys in [[], [''], [' '], 'synthetic', [1], None]:
            s = server(d)
            s._config.server.api_keys = keys
            with self.assertRaisesRegex(SingleAttemptPolicyError, '^AUTH_REQUIRED$'):
                Admission(s, self.marker, body_hash(BODY))
        d, s, gate = self.make()
        s._config.server.api_keys = []
        with self.assertRaisesRegex(SingleAttemptPolicyError, '^AUTH_REQUIRED$'):
            await gate.invoke(Request())
        self.assertFalse(self.marker.exists())
        d.navigate_new_chat.assert_not_called()

    async def test_auth_drift_during_request_parse_is_denied(self):
        d, s, gate = self.make()
        request = Request()
        async def drift():
            s._config.server.api_keys = ['changed']
            return BODY
        request.json = drift
        with self.assertRaisesRegex(SingleAttemptPolicyError, '^AUTH_REQUIRED$'):
            await gate.invoke(request)
        self.assertFalse(self.marker.exists())
        d.navigate_new_chat.assert_not_called()


if __name__ == '__main__': unittest.main()

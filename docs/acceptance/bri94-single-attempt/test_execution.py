import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from test_admission import BODY, Request, NoopLock
from test_single_attempt_adapter import Driver, server
from admission import body_hash
from execution import execute, classify_response, verify_source, same_python_source, target_absent, NoRedirect, SingleAttemptPolicyError


class Tests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.marker = Path(self.tmp.name) / 'once'
        self.summary = Path(self.tmp.name) / 'summary'

    def fixture(self, error=None):
        d = Driver(error)
        d.connect = AsyncMock()
        d.close = AsyncMock()
        d.navigate_new_chat = AsyncMock()
        d._owns_target = True
        d._target_id = 'synthetic-owned-target'
        cfg = server(d)._config
        cfg.server.api_keys = ['synthetic']
        return d, cfg

    async def run_fixture(self, d, cfg, request=None, source_check=lambda: None,
                          target_check=lambda target: True):
        with patch('chatgpt_web2api.api_server.MutationLock', NoopLock):
            return await execute(cfg, d, lambda c, driver: type(server(driver))(c, driver),
                                 request or Request(), body_hash(BODY), self.marker,
                                 self.summary, source_check, target_check)

    async def test_success_only_metadata_and_close(self):
        d, cfg = self.fixture()
        result = await self.run_fixture(d, cfg)
        self.assertEqual(result['classification'], 'response_received')
        self.assertEqual(result['native_tool_execution'], 'unverified')
        self.assertNotIn('synthetic-safe-result', self.summary.read_text())
        self.assertNotIn('synthetic', self.summary.read_text())
        self.assertTrue(result['marker_exists'])
        self.assertTrue(result['driver_closed'])
        d.close.assert_awaited_once()

    async def test_source_auth_hash_and_stream_deny_before_connect(self):
        for kind in ['source', 'auth', 'hash', 'stream']:
            with self.subTest(kind=kind):
                self.marker = Path(self.tmp.name) / (kind + '-once')
                self.summary = Path(self.tmp.name) / (kind + '-summary')
                d, cfg = self.fixture()
                request = Request()
                check = lambda: None
                if kind == 'source':
                    def check(): raise SingleAttemptPolicyError('SOURCE_NOT_PINNED')
                elif kind == 'auth': request.headers = {}
                elif kind == 'hash': request.body = {**BODY, 'model': 'changed'}
                else: request.body = {**BODY, 'stream': True}
                result = await self.run_fixture(d, cfg, request, check)
                self.assertEqual(result['classification'], 'policy_stop')
                d.connect.assert_not_called()
                self.assertEqual(d.calls, 0)

    async def test_connect_failure_unowned_target_and_config_drift_close(self):
        for kind in ['connect', 'unowned', 'drift']:
            self.marker = Path(self.tmp.name) / (kind + '-once')
            self.summary = Path(self.tmp.name) / (kind + '-summary')
            d, cfg = self.fixture()
            if kind == 'connect': d.connect.side_effect = RuntimeError('PRIVATE')
            elif kind == 'unowned': d._owns_target = False
            else:
                async def connect(): cfg.chatgpt.default_model = 'changed'
                d.connect.side_effect = connect
            result = await self.run_fixture(d, cfg)
            self.assertNotIn('PRIVATE', self.summary.read_text())
            d.close.assert_awaited_once()
            self.assertEqual(d.calls, 0)

    async def test_error_cancel_cleanup_and_rerun_preserve_evidence(self):
        d, cfg = self.fixture(TimeoutError('PRIVATE'))
        result = await self.run_fixture(d, cfg)
        self.assertEqual(result['classification'], 'http_error')
        saved = self.summary.read_bytes()
        d2, cfg2 = self.fixture()
        await self.run_fixture(d2, cfg2)
        self.assertEqual(saved, self.summary.read_bytes())
        d2.connect.assert_not_called()
        self.marker = Path(self.tmp.name) / 'cancel-once'
        self.summary = Path(self.tmp.name) / 'cancel-summary'
        d, cfg = self.fixture(asyncio.CancelledError())
        with self.assertRaises(asyncio.CancelledError): await self.run_fixture(d, cfg)
        self.assertTrue(self.marker.exists())
        self.assertTrue(json.loads(self.summary.read_text())['driver_closed'])

    async def test_cleanup_failure_is_never_success(self):
        d, cfg = self.fixture()
        d.close.side_effect = RuntimeError('PRIVATE')
        result = await self.run_fixture(d, cfg)
        self.assertEqual(result['classification'], 'cleanup_failed')
        self.assertFalse(result['driver_closed'])

    async def test_swallowed_close_failure_is_detected(self):
        d, cfg = self.fixture()
        result = await self.run_fixture(d, cfg, target_check=lambda target: False)
        self.assertEqual(result['classification'], 'cleanup_failed')
        self.assertFalse(result['driver_closed'])
        self.assertTrue(result['close_returned'])
        self.assertEqual(result['target_cleanup'], 'unverified')

    def test_only_newline_source_normalization(self):
        self.assertTrue(same_python_source('x\r\ny\r\n', 'x\ny\n'))
        self.assertFalse(same_python_source('x \r\n', 'x\n'))
        self.assertFalse(same_python_source('x\r\n', 'z\n'))

    def test_target_check_bounded_and_no_poll(self):
        from unittest.mock import MagicMock
        response = MagicMock()
        response.__enter__.return_value.status = 200
        response.__enter__.return_value.read.return_value = b'[{"id":"owned"}]'
        opener = MagicMock()
        opener.open.return_value = response
        with patch('execution.build_opener', return_value=opener) as build:
            self.assertFalse(target_absent('owned'))
            self.assertEqual(build.call_args.args[0].proxies, {})
            self.assertIsInstance(build.call_args.args[1], NoRedirect)
            self.assertIsNone(build.call_args.args[1].redirect_request(None, None, 302, '', {}, 'https://example.com'))
            opener.open.assert_called_once_with('http://127.0.0.1:9222/json/list', timeout=3)
            response.__enter__.return_value.read.assert_called_once_with(1024 * 1024 + 1)

    def test_target_non200_oversize_or_get_error_never_confirms(self):
        from unittest.mock import MagicMock
        for kind in ['redirect', 'oversize', 'get_error']:
            response = MagicMock()
            response.__enter__.return_value.status = 302 if kind == 'redirect' else 200
            response.__enter__.return_value.read.return_value = b'x' * (1024 * 1024 + 1)
            opener = MagicMock()
            opener.open.return_value = response
            if kind == 'get_error': opener.open.side_effect = OSError('PRIVATE')
            with patch('execution.build_opener', return_value=opener):
                with self.assertRaises((SingleAttemptPolicyError, OSError)):
                    target_absent('owned')

    def test_response_classification_does_not_infer_tools(self):
        from types import SimpleNamespace
        for status, expected in [(429, 'rate_limit'), (504, 'timeout')]:
            self.assertEqual(classify_response(SimpleNamespace(status=status))['classification'], expected)
        r = SimpleNamespace(status=200, body=b'{"choices":[]}')
        self.assertEqual(classify_response(r)['classification'], 'invalid_response')
        conversation = '12345678-1234-1234-1234-123456789abc'
        r = SimpleNamespace(status=200, body=json.dumps({'conversation_id': conversation,
            'choices': [{'message': {'content': 'PRIVATE'}}]}).encode())
        metadata = classify_response(r)
        self.assertEqual(metadata['conversation_id'], conversation)
        self.assertNotIn('PRIVATE', json.dumps(metadata))

    def test_source_wrong_head_and_foreign_module_rejected(self):
        with patch('execution.subprocess.check_output', return_value=b'wrong'):
            with self.assertRaises(SingleAttemptPolicyError): verify_source()


if __name__ == '__main__': unittest.main()

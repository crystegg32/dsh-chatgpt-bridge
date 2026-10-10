import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, AsyncMock, patch

from test_single_attempt_adapter import server, Driver
import run_probe
from admission import body_hash


class Tests(unittest.TestCase):
    def test_default_preflight_never_constructs_driver_or_executes(self):
        cfg = server(Driver())._config
        cfg.server.api_keys = ['synthetic']
        factory = Mock()
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(run_probe, 'load_runtime', return_value=(cfg, Mock(), factory)), \
                 patch.object(run_probe, 'MARKER', Path(directory) / 'once'), \
                 patch.object(run_probe, 'SUMMARY', Path(directory) / 'summary'), \
                 patch('sys.argv', ['run_probe.py']), \
                 contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(run_probe.main(), 0)
                self.assertIn('OFFLINE_PREFLIGHT_PASS', output.getvalue())
                factory.assert_not_called()

    def test_missing_receipt_never_constructs_driver(self):
        cfg = server(Driver())._config
        cfg.server.api_keys = ['synthetic']
        factory = Mock()
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(run_probe, 'load_runtime', return_value=(cfg, Mock(), factory)), \
                 patch.object(run_probe, 'MARKER', Path(directory) / 'once'), \
                 patch.object(run_probe, 'SUMMARY', Path(directory) / 'summary'), \
                 patch('sys.argv', ['run_probe.py', '--execute']), \
                 contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(run_probe.main(), 1)
                self.assertNotIn('synthetic', output.getvalue())
                factory.assert_not_called()

    def test_valid_receipt_dispatch_stub_wrong_hash_or_ready_refuses_driver(self):
        for kind in ['valid', 'wrong_hash', 'not_ready']:
            cfg = server(Driver())._config
            cfg.server.api_keys = ['synthetic']
            factory = Mock()
            execute = AsyncMock(return_value={'classification': 'response_received',
                                             'native_tool_execution': 'unverified'})
            with tempfile.TemporaryDirectory() as directory:
                receipt = Path(directory) / 'receipt'
                receipt.write_text(json.dumps({'purpose': 'bri94-native-capability-once',
                    'request_sha256': '0' * 64 if kind == 'wrong_hash' else body_hash(run_probe.probe_body()),
                    'ready': kind != 'not_ready'}), encoding='utf-8')
                with patch.object(run_probe, 'load_runtime', return_value=(cfg, Mock(), factory)), \
                     patch.object(run_probe, 'MARKER', Path(directory) / 'once'), \
                     patch.object(run_probe, 'SUMMARY', Path(directory) / 'summary'), \
                     patch.object(run_probe, 'execute', execute), \
                     patch('sys.argv', ['run_probe.py', '--execute', '--tunnel-ready-receipt', str(receipt)]), \
                     contextlib.redirect_stdout(io.StringIO()):
                    result = run_probe.main()
                    if kind == 'valid':
                        self.assertEqual(result, 0)
                        factory.assert_called_once()
                        execute.assert_awaited_once()
                    else:
                        self.assertEqual(result, 1)
                        factory.assert_not_called()
                        execute.assert_not_called()


if __name__ == '__main__': unittest.main()

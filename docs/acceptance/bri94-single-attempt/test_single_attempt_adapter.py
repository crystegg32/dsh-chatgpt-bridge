import asyncio
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

sys.path.insert(0, 'X:/dev/worktrees/bridge-cdp-timeout-diagnostics/src')
from chatgpt_web2api.api_server import APIServer
from chatgpt_web2api.cdp_driver import RateLimitError, ObservationRateLimitError
from chatgpt_web2api.config import Config
from single_attempt_adapter import prepare_single_attempt_instance, SingleAttemptPolicyError


class Driver:
    def __init__(self, error=None):
        self.error=error; self.calls=0; self._current_conv_id='synthetic-conversation'
        self.dismiss_rate_limit=AsyncMock()
    async def send_and_stream(self, text, **kwargs):
        self.calls+=1
        if self.error is not None:
            raise self.error
        yield SimpleNamespace(delta='synthetic-safe-result')


def server(driver):
    # Default dataclass config, not Config.load: no real operator config/secrets.
    return APIServer(Config(), driver)


class Tests(unittest.IsolatedAsyncioTestCase):
    async def test_success_once_and_original_method_intact(self):
        original=APIServer._full_response
        d=Driver(); s=prepare_single_attempt_instance(server(d))
        self.assertIs(s._full_response.__func__.__code__,original.__code__)
        r=await s._full_response(None,'auto','SYNTHETIC',120)
        self.assertEqual(json.loads(r.body)['conversation_id'],'synthetic-conversation')
        with self.assertRaises(SingleAttemptPolicyError):
            await s._full_response(None,'auto','SYNTHETIC',120)
        self.assertEqual(d.calls,1)
        self.assertIs(APIServer._full_response,original)

    async def test_errors_never_dismiss_sleep_or_resend(self):
        for error in [RateLimitError(retry_after=7),ObservationRateLimitError(),
                      TimeoutError('SYNTHETIC'),RuntimeError('SYNTHETIC')]:
            with self.subTest(kind=type(error).__name__):
                d=Driver(error);s=prepare_single_attempt_instance(server(d))
                with patch('chatgpt_web2api.resilience.asyncio.sleep',new_callable=AsyncMock) as sleep:
                    with self.assertRaises(type(error)) as caught:
                        await s._full_response(None,'auto','SYNTHETIC',120)
                    self.assertIs(caught.exception,error)
                    with self.assertRaises(SingleAttemptPolicyError):
                        await s._full_response(None,'auto','SYNTHETIC',120)
                    self.assertEqual(d.calls,1);d.dismiss_rate_limit.assert_not_called();sleep.assert_not_called()
                self.assertIsNone(s._last_successful_send_at)

    async def test_rate_limit_response_contract_unchanged(self):
        d=Driver(RateLimitError(retry_after=7));s=prepare_single_attempt_instance(server(d))
        with self.assertRaises(RateLimitError) as caught:
            await s._full_response(None,'auto','SYNTHETIC',120)
        response=s._error_response(caught.exception)
        self.assertEqual(response.status,429);self.assertEqual(response.headers['Retry-After'],'7')

    async def test_observation_error_provenance_unchanged(self):
        error=ObservationRateLimitError(retry_after=9,retry_after_source='upstream_header')
        d=Driver(error);s=prepare_single_attempt_instance(server(d))
        with self.assertRaises(ObservationRateLimitError) as caught:
            await s._full_response(None,'auto','SYNTHETIC',120)
        response=s._error_response(caught.exception)
        self.assertEqual(response.status,429)
        self.assertEqual(json.loads(response.body)['error']['retry_after_source'],'upstream_header')
        self.assertEqual(d.calls,1)

    async def test_stream_rejected_before_driver(self):
        d=Driver();s=prepare_single_attempt_instance(server(d))
        with self.assertRaises(SingleAttemptPolicyError):
            await s._stream_response(None,'auto','SYNTHETIC',120)
        self.assertEqual(d.calls,0)

    async def test_other_instance_untouched_and_reinstall_refused(self):
        s=prepare_single_attempt_instance(server(Driver()));other=server(Driver())
        self.assertIs(other._full_response.__func__,APIServer._full_response)
        with self.assertRaises(SingleAttemptPolicyError):prepare_single_attempt_instance(s)

    async def test_cancellation_does_not_restore_budget(self):
        d=Driver(asyncio.CancelledError());s=prepare_single_attempt_instance(server(d))
        with self.assertRaises(asyncio.CancelledError):
            await s._full_response(None,'auto','SYNTHETIC',120)
        with self.assertRaises(SingleAttemptPolicyError):
            await s._full_response(None,'auto','SYNTHETIC',120)
        self.assertEqual(d.calls,1)


if __name__=='__main__':unittest.main()

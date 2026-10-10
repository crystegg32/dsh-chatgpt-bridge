"""OFFLINE CANDIDATE: instance-local non-streaming acceptance adapter.

Does not start services, access Chrome, submit prompts, alter source files, or
patch module globals. Runtime installation is a separate gate.
"""
from types import FunctionType, MethodType


class SingleAttemptPolicyError(RuntimeError):
    pass


def prepare_single_attempt_instance(server):
    from chatgpt_web2api.api_server import APIServer
    from chatgpt_web2api.resilience import retry_on_rate_limit

    original = APIServer._full_response
    if type(server) is not APIServer or server._full_response.__func__ is not original:
        raise SingleAttemptPolicyError("UNEXPECTED_SERVER_IMPLEMENTATION")
    if original.__globals__.get("retry_on_rate_limit") is not retry_on_rate_limit:
        raise SingleAttemptPolicyError("UNEXPECTED_RETRY_IMPLEMENTATION")
    used = False

    async def once(driver, factory):
        nonlocal used
        if used:
            raise SingleAttemptPolicyError("ATTEMPT_ALREADY_CONSUMED")
        used = True  # before the first await; errors/cancellation never reset it
        return await retry_on_rate_limit(driver, factory, max_attempts=1)

    namespace = dict(original.__globals__)
    namespace["retry_on_rate_limit"] = once
    cloned = FunctionType(original.__code__, namespace, original.__name__,
                          original.__defaults__, original.__closure__)
    cloned.__kwdefaults__ = original.__kwdefaults__

    async def reject_stream(*args, **kwargs):
        raise SingleAttemptPolicyError("STREAM_NOT_AUTHORIZED")

    server._full_response = MethodType(cloned, server)
    server._stream_response = MethodType(reject_stream, server)
    return server

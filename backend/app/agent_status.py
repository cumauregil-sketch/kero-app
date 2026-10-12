"""Named progress events from real model calls, never simulated timers.

Mirza currently maps to Gemini and Seko maps to the free Nemotron planner.
Future roles must only be announced once their actual execution begins.
"""
from collections.abc import Callable
from contextvars import ContextVar, Token

AGENT_NAMES = {"mirza": "Mirza", "seko": "Seko", "alex": "Alex"}
_StatusSink = Callable[[dict[str, str]], None]
_sink: ContextVar[_StatusSink | None] = ContextVar("kero_status_sink", default=None)


def register_status_sink(sink: _StatusSink) -> Token:
    return _sink.set(sink)


def reset_status_sink(token: Token) -> None:
    _sink.reset(token)


def report_status(agent_id: str, activity: str) -> None:
    sink = _sink.get()
    if sink is None or agent_id not in AGENT_NAMES:
        return
    sink({"agent": AGENT_NAMES[agent_id], "activity": activity})

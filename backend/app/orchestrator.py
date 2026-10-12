"""Opt-in, cost-aware Gemini-to-free-Nemotron planner delegation.

Normal conversation takes the existing Gemini path without extra network calls.
No tools, deployments or side effects are available to the planning specialist.
"""

from collections.abc import Mapping, Sequence
import logging
import time

from .planner import create_plan
from .task_router import propose_route

logger = logging.getLogger("uvicorn.error")

# Deliberately conservative: false negatives keep the existing Gemini behavior.
# The keyword filter is not a classifier; Gemini verifies candidate requests.
_PLANNING_HINTS = (
    "plan", "stratej", "yol harita", "yol haritas", "aşama",
    "asama", "adım adım", "adim adim", "öncelik", "oncelik",
    "takvim", "roadmap", "nasıl ilerle", "nasil ilerle",
    "nasıl yapacağız", "nasıl yapalım", "nasil yapacagiz",
    "nasil yapalim", "ilk hangi adım", "ilk hangi adim",
    "proje geliştir", "proje gelistir", "uygulama geliştirme",
)


def should_consider_planning(message: str) -> bool:
    """Only pay for model routing when the request might need a planner."""
    value = message.casefold().strip()
    return bool(value) and any(hint in value for hint in _PLANNING_HINTS)


async def maybe_delegate_planning(
    message: str,
    *,
    gemini_key: str,
    gemini_model: str,
    openrouter_key: str,
    history: Sequence[Mapping[str, str]] | None = None,
) -> str | None:
    """Return a specialist text plan, or None to use the usual Gemini chat.

    The plan and previous messages are context only. Neither model can run tools.
    Gemini routes only clearly planning-related tasks. The free Nemotron model
    is used only when the Gemini routing proposal allows it.
    """
    if not should_consider_planning(message):
        return None

    context = list(history or [])[-6:]
    start = time.monotonic()
    route = await propose_route(
        message, api_key=gemini_key, model=gemini_model, history=context
    )
    logger.info(
        "kero_router status=ok intent=%s needs_web=%s elapsed_ms=%d",
        route.intent,
        route.needs_web,
        round((time.monotonic() - start) * 1000),
    )
    if route.intent != "planning" or "planner" not in route.specialists:
        return None
    if route.needs_web:
        return None

    return await create_plan(message, api_key=openrouter_key, history=context)

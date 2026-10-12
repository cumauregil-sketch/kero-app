"""Optional Gemini-to-free-Nemotron planning delegation; no tool execution."""

from .planner import create_plan
from .task_router import propose_route


async def maybe_delegate_planning(
    message: str,
    *,
    gemini_key: str,
    gemini_model: str,
    openrouter_key: str,
) -> str | None:
    """Return a plan for planning-only tasks; return None for all other tasks.

    Gemini selects a task category; only the pinned free OpenRouter model
    may answer a planning task. Requests needing current web sources are not
    delegated to a model without browsing. No external action is performed.
    """
    route = await propose_route(message, api_key=gemini_key, model=gemini_model)
    if route.intent != "planning" or "planner" not in route.specialists:
        return None
    if route.needs_web:
        return None

    return await create_plan(message, api_key=openrouter_key)

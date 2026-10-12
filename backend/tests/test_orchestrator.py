"""Offline tests for optional Gemini-to-Nemotron routing."""

import unittest
from unittest.mock import AsyncMock, patch

from app.orchestrator import maybe_delegate_planning
from app.task_router import RoutePlan


class OrchestratorTests(unittest.IsolatedAsyncioTestCase):
    async def run_case(self, *, intent, specialists, needs_web=False):
        route = RoutePlan(
            intent=intent,
            specialists=specialists,
            needs_web=needs_web,
            needs_approval=False,
            reason="Test"
        )
        with patch("app.orchestrator.propose_route", new_callable=AsyncMock) as classify:
            with patch("app.orchestrator.create_plan", new_callable=AsyncMock) as plan:
                classify.return_value = route
                plan.return_value = "Üç aşamalı plan"
                result = await maybe_delegate_planning(
                    "Üç aşamalı proje planı yap",
                    gemini_key="test-gemini",
                    gemini_model="test-gemini-model",
                    openrouter_key="test-openrouter"
                )
                return result, classify, plan

    async def test_planning_goes_to_specialist(self):
        result, classify, plan = await self.run_case(
            intent="planning", specialists=["planner"])
        self.assertEqual(result, "Üç aşamalı plan")
        classify.assert_awaited_once()
        plan.assert_awaited_once_with("Üç aşamalı proje planı yap", api_key="test-openrouter")

    async def test_chitchat_stays_with_gemini(self):
        result, _, plan = await self.run_case(intent="chat", specialists=[])
        self.assertIsNone(result)
        plan.assert_not_awaited()

    async def test_coding_stays_with_gemini_until_coder_connected(self):
        result, _, plan = await self.run_case(intent="coding", specialists=["coder"])
        self.assertIsNone(result)
        plan.assert_not_awaited()

    async def test_web_research_is_not_fake_planning(self):
        result, _, plan = await self.run_case(
            intent="planning", specialists=["planner", "researcher"], needs_web=True)
        self.assertIsNone(result)
        plan.assert_not_awaited()

    async def test_planning_without_planner_role_is_not_delegated(self):
        result, _, plan = await self.run_case(intent="planning", specialists=["analyst"])
        self.assertIsNone(result)
        plan.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()

"""Offline tests for optional Gemini-to-Nemotron task routing."""

import unittest
from unittest.mock import AsyncMock, patch

from app.orchestrator import maybe_delegate_planning, should_consider_planning
from app.task_router import RoutePlan


TASK = "Üç aşamalı proje planı yap"
HISTORY = [
    {"role": "user", "content": "Bir emlak uygulaması kuracağız."},
    {"role": "assistant", "content": "Önce temel gereksinimleri belirleyelim."},
]


class FastPathTests(unittest.TestCase):
    def test_chat_does_not_need_classifier(self):
        for message in ("Merhaba", "Bugün nasılsın?", "Teşekkür ederim", "Naber?"):
            self.assertFalse(should_consider_planning(message))

    def test_planning_phrases_are_candidates(self):
        for message in (
            "Bana bir plan hazırla",
            "Gayrimenkul ofisim için strateji kur",
            "Projenin yol haritasını çıkar",
            "Ne yapacağız, adım adım anlat",
        ):
            self.assertTrue(should_consider_planning(message))


class OrchestratorTests(unittest.IsolatedAsyncioTestCase):
    async def run_case(self, *, intent, specialists, needs_web=False, history=None):
        route = RoutePlan(
            intent=intent,
            specialists=specialists,
            needs_web=needs_web,
            needs_approval=False,
            reason="Test",
        )
        with patch("app.orchestrator.propose_route", new_callable=AsyncMock) as classify:
            with patch("app.orchestrator.create_plan", new_callable=AsyncMock) as plan:
                classify.return_value = route
                plan.return_value = "Üç aşamalı plan"
                result = await maybe_delegate_planning(
                    TASK,
                    gemini_key="test-gemini",
                    gemini_model="test-gemini-model",
                    openrouter_key="test-openrouter",
                    history=history,
                )
                return result, classify, plan

    async def test_planning_goes_to_specialist_with_context(self):
        result, classify, plan = await self.run_case(
            intent="planning", specialists=["planner"], history=HISTORY
        )
        self.assertEqual(result, "Üç aşamalı plan")
        classify.assert_awaited_once_with(
            TASK, api_key="test-gemini", model="test-gemini-model", history=HISTORY
        )
        plan.assert_awaited_once_with(
            TASK, api_key="test-openrouter", history=HISTORY
        )

    async def test_no_context_still_works(self):
        result, _, plan = await self.run_case(intent="planning", specialists=["planner"])
        self.assertEqual(result, "Üç aşamalı plan")
        plan.assert_awaited_once_with(TASK, api_key="test-openrouter", history=[])

    async def test_ordinary_chat_makes_zero_extra_requests(self):
        with patch("app.orchestrator.propose_route", new_callable=AsyncMock) as classify:
            with patch("app.orchestrator.create_plan", new_callable=AsyncMock) as plan:
                result = await maybe_delegate_planning(
                    "Merhaba nasılsın?",
                    gemini_key="test-gemini",
                    gemini_model="test-model",
                    openrouter_key="test-openrouter",
                    history=HISTORY,
                )
                self.assertIsNone(result)
                classify.assert_not_awaited()
                plan.assert_not_awaited()

    async def test_coding_stays_with_gemini_until_coder_connected(self):
        result, _, plan = await self.run_case(
            intent="coding", specialists=["coder"]
        )
        self.assertIsNone(result)
        plan.assert_not_awaited()

    async def test_web_research_is_not_fake_planning(self):
        result, _, plan = await self.run_case(
            intent="planning", specialists=["planner", "researcher"], needs_web=True
        )
        self.assertIsNone(result)
        plan.assert_not_awaited()

    async def test_planning_without_planner_role_is_not_delegated(self):
        result, _, plan = await self.run_case(
            intent="planning", specialists=["analyst"]
        )
        self.assertIsNone(result)
        plan.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()

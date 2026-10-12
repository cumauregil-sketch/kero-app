"""Offline tests: planning uses only the chosen free model, never tools."""

import json
import unittest

import httpx

from app.planner import PLANNING_MODEL, PlannerReplyError, create_plan, parse_planner_reply


class PlannerResponseTests(unittest.TestCase):
    def test_text_answer(self):
        self.assertEqual(
            parse_planner_reply({"choices": [{"message": {"content": "  Önce araştır.  "}}]}),
            "Önce araştır.",
        )

    def test_empty_answer_rejected(self):
        with self.assertRaises(PlannerReplyError):
            parse_planner_reply({"choices": [{"message": {"content": "  "}}]})

    def test_missing_choices_rejected(self):
        with self.assertRaises(PlannerReplyError):
            parse_planner_reply({"choices": []})

    def test_invalid_message_rejected(self):
        with self.assertRaises(PlannerReplyError):
            parse_planner_reply({"choices": [{"message": None}]})


class PlannerApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_only_free_nemotron_model_is_requested(self):
        seen = []
        def handler(req):
            seen.append((str(req.url), req.headers.get("Authorization"), json.loads(req.content)))
            return httpx.Response(200, json={"choices": [{"message": {"content": "1. Analiz\n2. Test"}}]})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            output = await create_plan("Bir proje planla", api_key="test-key", client=client)
        self.assertEqual(output, "1. Analiz\n2. Test")
        self.assertEqual(len(seen), 1)
        self.assertEqual(seen[0][0], "https://openrouter.ai/api/v1/chat/completions")
        self.assertEqual(seen[0][1], "Bearer test-key")
        self.assertEqual(PLANNING_MODEL, "nvidia/nemotron-3-ultra-550b-a55b:free")
        self.assertEqual(seen[0][2]["model"], PLANNING_MODEL)
        self.assertEqual(seen[0][2]["messages"][-1]["content"], "Bir proje planla")
        self.assertNotIn("tools", seen[0][2])
        self.assertNotIn("tool_choice", seen[0][2])

    async def test_past_messages_are_sent_with_bounded_history(self):
        received = []
        def handler(req):
            received.append(json.loads(req.content))
            return httpx.Response(200, json={
                "choices": [{"message": {"content": "Plan tamam"}}]
            })

        history = [
            {"role": "user", "content": "Gayrimenkul ofisi için proje"},
            {"role": "assistant", "content": "Önceliğin nedir?"},
        ]
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await create_plan(
                "Üç aşamalı plan yap",
                api_key="test-key",
                client=client,
                history=history,
            )
        self.assertEqual(result, "Plan tamam")
        messages = received[0]["messages"]
        self.assertEqual(
            [m["role"] for m in messages],
            ["system", "user", "assistant", "user"],
        )
        self.assertEqual(messages[-2]["content"], "Önceliğin nedir?")
        self.assertEqual(messages[-1]["content"], "Üç aşamalı plan yap")

    async def test_provider_rate_limit_is_propagated(self):
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(429))) as client:
            with self.assertRaises(httpx.HTTPStatusError):
                await create_plan("Planla", api_key="test-key", client=client)


if __name__ == "__main__":
    unittest.main()

"""Tests for the opt-in task router; no external API calls or dispatches."""

import asyncio
import json
import unittest

import httpx

from app.task_router import InvalidRouteError, parse_route, propose_route


def provider_reply(plan):
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(plan)}]}}]}


def valid_plan(**changes):
    plan = {
        "intent": "chat",
        "specialists": [],
        "needs_web": False,
        "needs_approval": False,
        "reason": "Sadece sohbet.",
    }
    plan.update(changes)
    return plan


class ParseRouteTests(unittest.TestCase):
    def test_simple_chat_uses_no_specialist(self):
        p = parse_route(provider_reply(valid_plan()))
        self.assertEqual(p.intent, "chat")
        self.assertEqual(p.specialists, [])
        self.assertFalse(p.needs_web)

    def test_research_route(self):
        p = parse_route(provider_reply(valid_plan(intent="research", specialists=["researcher"], needs_web=True)))
        self.assertEqual(p.specialists, ["researcher"])
        self.assertTrue(p.needs_web)

    def test_coding_route(self):
        p = parse_route(provider_reply(valid_plan(intent="coding", specialists=["coder", "reviewer"])))
        self.assertEqual(p.specialists, ["coder", "reviewer"])

    def test_invalid_specialist_is_rejected(self):
        with self.assertRaises(InvalidRouteError):
            parse_route(provider_reply(valid_plan(specialists=["dangerous_shell_tool"])))

    def test_unknown_intent_is_rejected(self):
        with self.assertRaises(InvalidRouteError):
            parse_route(provider_reply(valid_plan(intent="execute")))

    def test_duplicate_specialists_are_rejected(self):
        with self.assertRaises(InvalidRouteError):
            parse_route(provider_reply(valid_plan(specialists=["coder", "coder"])))

    def test_more_than_three_specialists_are_rejected(self):
        with self.assertRaises(InvalidRouteError):
            parse_route(provider_reply(valid_plan(specialists=["coder", "reviewer", "analyst", "planner"])))

    def test_invalid_json_is_rejected(self):
        with self.assertRaises(InvalidRouteError):
            parse_route({"candidates": [{"content": {"parts": [{"text": "not json"}]}}]})

    def test_missing_candidate_is_rejected(self):
        with self.assertRaises(InvalidRouteError):
            parse_route({"candidates": []})

    def test_missing_approval_flag_is_rejected(self):
        p = valid_plan()
        del p["needs_approval"]
        with self.assertRaises(InvalidRouteError):
            parse_route(provider_reply(p))

    def test_bad_flag_types_are_rejected(self):
        with self.assertRaises(InvalidRouteError):
            parse_route(provider_reply(valid_plan(needs_web="yes")))

    def test_reason_must_be_nonempty(self):
        with self.assertRaises(InvalidRouteError):
            parse_route(provider_reply(valid_plan(reason="")))


class ProposeRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_sends_schema_request_without_dispatching(self):
        seen = []
        def handler(request):
            payload = json.loads(request.content)
            seen.append((request.url, request.headers.get("x-goog-api-key"), payload))
            return httpx.Response(200, json=provider_reply(valid_plan(intent="coding", specialists=["coder"])))

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await propose_route("Python kodu yaz", api_key="test-only", model="test-model", client=client)
        self.assertEqual(result.intent, "coding")
        self.assertEqual(result.specialists, ["coder"])
        self.assertEqual(len(seen), 1)
        self.assertTrue(str(seen[0][0]).endswith("/models/test-model:generateContent"))
        self.assertEqual(seen[0][1], "test-only")
        self.assertEqual(seen[0][2]["generationConfig"]["responseMimeType"], "application/json")
        self.assertEqual(seen[0][2]["contents"][0]["parts"][0]["text"], "Python kodu yaz")

    async def test_provider_http_failure_is_not_silently_accepted(self):
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(429))) as client:
            with self.assertRaises(httpx.HTTPStatusError):
                await propose_route("Araştır", api_key="test-only", model="test-model", client=client)


if __name__ == "__main__":
    unittest.main()

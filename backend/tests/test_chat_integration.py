"""HTTP-level chat tests with mocked model replies and zero live API calls."""

import asyncio
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

from app.main import app


AUTH = {"X-Kero-Access-Code": "pilot-test"}


def fake_gemini():
    return SimpleNamespace(
        raise_for_status=lambda: None,
        json=lambda: {
            "candidates": [{"content": {"parts": [{"text": "Gemini yanıtı"}]}}]
        },
    )


class ChatEndpointTests(unittest.TestCase):
    def send(self, message, history=None):
        with TestClient(app) as client:
            return client.post(
                "/api/chat",
                headers=AUTH,
                json={"message": message, "history": history or []},
            )

    def environment(self, enabled):
        return patch.dict(os.environ, {
            "GEMINI_API_KEY": "dummy-gemini",
            "KERO_ACCESS_CODE": "pilot-test",
            "OPENROUTER_API_KEY": "dummy-openrouter",
            "KERO_ENABLE_MULTI_AI": "true" if enabled else "false",
        })

    def test_flag_off_retains_original_chat(self):
        with self.environment(False):
            with patch("app.main.maybe_delegate_planning", new_callable=AsyncMock) as delegated:
                with patch("app.main.httpx.AsyncClient") as http:
                    http.return_value.__aenter__.return_value.post = AsyncMock(return_value=fake_gemini())
                    response = self.send("Bir plan çıkar")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reply"], "Gemini yanıtı")
        delegated.assert_not_awaited()

    def test_gemini_instruction_does_not_assume_product_features(self):
        with self.environment(False):
            with patch("app.main.httpx.AsyncClient") as http:
                endpoint = http.return_value.__aenter__.return_value
                endpoint.post = AsyncMock(return_value=fake_gemini())
                response = self.send("Cans Atlas için iş planı hazırla")
                request_body = endpoint.post.await_args.kwargs["json"]

        self.assertEqual(response.status_code, 200)
        policy = request_body["systemInstruction"]["parts"][0]["text"]
        for required in ("varsayma", "mevcut özellik", "CRM", "API/XML", "IDX/MLS"):
            self.assertIn(required, policy)

    def test_enabled_planning_returns_specialist_response_with_history(self):
        history = [
            {"role": "user", "content": "Bir emlak ofisim var"},
            {"role": "assistant", "content": "Ne geliştirelim?"},
        ]
        with self.environment(True):
            with patch("app.main.maybe_delegate_planning", new_callable=AsyncMock) as delegated:
                delegated.return_value = "Nemotron planı"
                response = self.send("Üç aşamalı plan hazırla", history)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reply"], "Nemotron planı")
        self.assertEqual(delegated.await_args.kwargs["history"], history)

    def test_enabled_ordinary_chat_avoids_router_call(self):
        with self.environment(True):
            with patch("app.orchestrator.propose_route", new_callable=AsyncMock) as route:
                with patch("app.main.httpx.AsyncClient") as http:
                    http.return_value.__aenter__.return_value.post = AsyncMock(return_value=fake_gemini())
                    response = self.send("Merhaba, nasılsın?")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reply"], "Gemini yanıtı")
        route.assert_not_awaited()

    def test_specialist_timeout_falls_back_to_gemini(self):
        with self.environment(True):
            with patch("app.main.maybe_delegate_planning", new_callable=AsyncMock) as delegated:
                delegated.side_effect = httpx.TimeoutException("Service unavailable")
                with patch("app.main.httpx.AsyncClient") as http:
                    http.return_value.__aenter__.return_value.post = AsyncMock(return_value=fake_gemini())
                    response = self.send("Bir iş planı yap")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reply"], "Gemini yanıtı")

    def test_hard_deadline_prevents_extremely_slow_specialist(self):
        async def slow_specialist(*args, **kwargs):
            await asyncio.sleep(0.2)
            return "This should not be used"

        with self.environment(True):
            with patch("app.main.PLANNING_DEADLINE_SECONDS", 0.01):
                with patch("app.main.maybe_delegate_planning", new_callable=AsyncMock) as delegate:
                    delegate.side_effect = slow_specialist
                    with patch("app.main.httpx.AsyncClient") as http:
                        http.return_value.__aenter__.return_value.post = AsyncMock(return_value=fake_gemini())
                        response = self.send("Bir iş planı yap")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reply"], "Gemini yanıtı")

    def test_wrong_access_code_is_denied_before_routing(self):
        with self.environment(True):
            with patch("app.main.maybe_delegate_planning", new_callable=AsyncMock) as delegated:
                with TestClient(app) as client:
                    response = client.post(
                        "/api/chat", headers={"X-Kero-Access-Code": "wrong"},
                        json={"message": "Bana plan yap", "history": []},
                    )
        self.assertEqual(response.status_code, 401)
        delegated.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()

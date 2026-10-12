"""Owner dashboard endpoint checks; run offline, with temporary SQLite only."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.beta_accounts import BetaAccounts


ADMIN_TOKEN = "a-secure-long-admin-token-for-offline-tests-123456"


class BetaAdminRouteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = str(Path(self.temp.name) / "beta.sqlite3")
        self.values = {
            "KERO_BETA_ENABLED": "true",
            "KERO_BETA_DB_PATH": self.path,
            "KERO_BETA_STORAGE_READY": "true",
            "KERO_BETA_ADMIN_TOKEN": ADMIN_TOKEN,
        }
        self.patch = patch.dict(os.environ, self.values)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.client = TestClient(app)
        self.headers = {"X-Kero-Beta-Admin-Token": ADMIN_TOKEN}

    def test_owner_access_requires_valid_token(self):
        self.assertEqual(self.client.get("/api/beta/admin/status").status_code, 401)
        self.assertEqual(self.client.get("/api/beta/admin/status", headers={
            "X-Kero-Beta-Admin-Token": "wrong"
        }).status_code, 401)
        response = self.client.get("/api/beta/admin/status", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "capacity": 50, "registered": 0, "reserved": 0, "available": 50,
        })

    def test_disabled_storage_and_admin_token_fail_closed(self):
        for key in ("KERO_BETA_ENABLED", "KERO_BETA_STORAGE_READY", "KERO_BETA_ADMIN_TOKEN"):
            with self.subTest(key=key):
                with patch.dict(os.environ, {key: ""}):
                    response = self.client.get("/api/beta/admin/status", headers=self.headers)
                    self.assertEqual(response.status_code, 503)

    def test_full_invitation_lifecycle_and_private_code(self):
        created = self.client.post("/api/beta/admin/invitations", headers=self.headers, json={
            "username": "testuser", "days_valid": 7,
        })
        self.assertEqual(created.status_code, 201)
        code = created.json()["code"]
        self.assertGreater(len(code), 30)
        status = self.client.get("/api/beta/admin/status", headers=self.headers).json()
        self.assertEqual(status["reserved"], 1)
        self.assertEqual(status["available"], 49)

        list_response = self.client.get("/api/beta/admin/invitations", headers=self.headers)
        self.assertEqual(list_response.status_code, 200)
        items = list_response.json()["invitations"]
        self.assertEqual(items[0]["status"], "pending")
        self.assertNotIn("code", items[0])
        self.assertNotIn(code, str(items))

        revoked = self.client.post(
            f'/api/beta/admin/invitations/{items[0]["id"]}/revoke', headers=self.headers,
        )
        self.assertEqual(revoked.status_code, 200)
        self.assertEqual(
            self.client.get("/api/beta/admin/status", headers=self.headers).json()["available"], 50,
        )
        self.assertEqual(
            self.client.get("/api/beta/admin/invitations", headers=self.headers).json()["invitations"][0]["status"],
            "revoked",
        )
        self.assertEqual(self.client.post(
            f'/api/beta/admin/invitations/{items[0]["id"]}/revoke', headers=self.headers
        ).status_code, 404)

    def test_50_pending_codes_reserve_all_slots(self):
        store = BetaAccounts(self.path)
        for i in range(50):
            store.issue_invitation(f"guest{i}")
        self.assertEqual(
            self.client.get("/api/beta/admin/status", headers=self.headers).json()["available"], 0,
        )
        self.assertEqual(self.client.post("/api/beta/admin/invitations", headers=self.headers,
                                          json={"username": "guest50"}).status_code, 409)

    def test_rejects_invalid_input_and_unknown_admin_routes(self):
        self.assertEqual(self.client.post("/api/beta/admin/invitations", headers=self.headers,
                                          json={"username": "x"}).status_code, 422)
        self.assertEqual(self.client.get("/api/beta/admin/hidden", headers=self.headers).status_code, 404)


if __name__ == "__main__":
    unittest.main()

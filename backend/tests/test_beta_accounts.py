"""KERO 50-account registry unit tests (offline, no API keys)."""

import concurrent.futures
import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.beta_accounts import (
    AccountAlreadyExists,
    BetaAccounts,
    BetaFull,
    InvalidAccount,
    MAX_BETA_ACCOUNTS,
)


class BetaAccountsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = Path(self.temp.name) / "beta.sqlite3"
        self.accounts = BetaAccounts(self.db)

    def _seed(self, how_many):
        with self.accounts._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            for i in range(how_many):
                db.execute(
                    "INSERT INTO beta_accounts (username,username_key,password_salt,password_hash) VALUES (?,?,?,?)",
                    (f"seed{i}", f"seed{i}", b"x" * 16, b"y" * 32),
                )
            db.execute("COMMIT")

    def test_registration_and_login_are_persistent_and_password_not_plaintext(self):
        user_id = self.accounts.register("Dayi", "correct-horse-battery")
        again = BetaAccounts(self.db)
        self.assertEqual(again.count(), 1)
        self.assertEqual(again.authenticate("DAYI", "correct-horse-battery"), user_id)
        self.assertIsNone(again.authenticate("Dayi", "wrong-password"))
        self.assertIsNone(again.authenticate("notfound", "correct-horse-battery"))
        with sqlite3.connect(self.db) as conn:
            stored = conn.execute("SELECT password_hash FROM beta_accounts").fetchone()[0]
        self.assertNotIn(b"correct-horse", stored)

    def test_rejects_duplicate_casefolded_username(self):
        self.accounts.register("KERO", "example-long-password")
        with self.assertRaises(AccountAlreadyExists):
            self.accounts.register("kero", "another-long-password")
        self.assertEqual(self.accounts.count(), 1)

    def test_rejects_weak_password_and_bad_username(self):
        with self.assertRaises(InvalidAccount):
            self.accounts.register("x", "example-long-password")
        with self.assertRaises(InvalidAccount):
            self.accounts.register("username", "short")
        self.assertEqual(self.accounts.count(), 0)

    def test_rejects_51st_registration(self):
        self._seed(MAX_BETA_ACCOUNTS)
        with self.assertRaises(BetaFull):
            self.accounts.register("extra", "example-long-password")
        self.assertEqual(self.accounts.count(), 50)

    def test_concurrent_last_slot_only_one_wins(self):
        self._seed(MAX_BETA_ACCOUNTS - 1)

        def signup(i):
            try:
                BetaAccounts(self.db).register(f"extra{i}", "example-long-password")
                return True
            except BetaFull:
                return False

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(signup, range(4)))
        self.assertEqual(results.count(True), 1)
        self.assertEqual(results.count(False), 3)
        self.assertEqual(self.accounts.count(), 50)

    def test_memory_database_disallowed(self):
        with self.assertRaises(ValueError):
            BetaAccounts(":memory:")


if __name__ == "__main__":
    unittest.main()

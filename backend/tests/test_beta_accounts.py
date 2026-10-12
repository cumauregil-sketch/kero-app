"""Invite-only 50-account registry tests. No API keys or external services."""

import concurrent.futures
import hashlib
import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.beta_accounts import (
    AccountAlreadyExists,
    BetaAccounts,
    BetaFull,
    InvalidAccount,
    InvalidInvitation,
    InvitationRequired,
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
                    "INSERT INTO beta_accounts (username,username_key,password_salt,password_hash) "
                    "VALUES (?,?,?,?)",
                    (f"seed{i}", f"seed{i}", b"x" * 16, b"y" * 32),
                )
            db.execute("COMMIT")

    def _register_invited(self, username, password="correct-horse-battery"):
        token = self.accounts.issue_invitation(username)
        return self.accounts.register(username, password, token)

    def test_invite_only_and_persistent_login(self):
        with self.assertRaises(InvitationRequired):
            self.accounts.register("Dayi", "correct-horse-battery")
        user_id = self._register_invited("Dayi")
        again = BetaAccounts(self.db)
        self.assertEqual(again.count(), 1)
        self.assertEqual(again.authenticate("DAYI", "correct-horse-battery"), user_id)
        self.assertIsNone(again.authenticate("Dayi", "wrong-password"))
        self.assertIsNone(again.authenticate("notfound", "correct-horse-battery"))
        with sqlite3.connect(self.db) as conn:
            stored = conn.execute("SELECT password_hash FROM beta_accounts").fetchone()[0]
        self.assertNotIn(b"correct-horse", stored)

    def test_duplicate_account_and_invitation_username(self):
        invitation = self.accounts.issue_invitation("KERO")
        with self.assertRaises(AccountAlreadyExists):
            self.accounts.issue_invitation("kero")
        self.accounts.register("KERO", "example-long-password", invitation)
        with self.assertRaises(AccountAlreadyExists):
            self.accounts.issue_invitation("kero")
        self.assertEqual(self.accounts.count(), 1)

    def test_rejects_weak_password_bad_username_and_bad_invites(self):
        with self.assertRaises(InvalidAccount):
            self.accounts.issue_invitation("x")
        invitation = self.accounts.issue_invitation("username")
        with self.assertRaises(InvalidAccount):
            self.accounts.register("username", "short", invitation)
        with self.assertRaises(InvalidInvitation):
            self.accounts.register("different", "example-long-password", invitation)
        with self.assertRaises(InvalidInvitation):
            self.accounts.register("username", "example-long-password", "fake")
        self.assertEqual(self.accounts.count(), 0)
        self.assertEqual(self.accounts.pending_invitations(), 1)

    def test_single_use_code_replay_is_rejected(self):
        code = self.accounts.issue_invitation("testuser")
        self.accounts.register("testuser", "example-long-password", code)
        with self.assertRaises(InvalidInvitation):
            self.accounts.register("testuser", "example-long-password", code)
        self.assertEqual(self.accounts.count(), 1)
        self.assertEqual(self.accounts.pending_invitations(), 0)

    def test_invitation_only_digest_stored(self):
        code = self.accounts.issue_invitation("testuser")
        with sqlite3.connect(self.db) as conn:
            stored = conn.execute("SELECT token_digest FROM beta_invitations").fetchone()[0]
        self.assertNotEqual(stored, code)
        self.assertEqual(stored, hashlib.sha256(code.encode()).hexdigest())

    def test_revocation_frees_reserved_slot(self):
        code = self.accounts.issue_invitation("testuser")
        self.assertEqual(self.accounts.pending_invitations(), 1)
        self.assertTrue(self.accounts.revoke_invitation(code))
        self.assertFalse(self.accounts.revoke_invitation(code))
        with self.assertRaises(InvalidInvitation):
            self.accounts.register("testuser", "example-long-password", code)
        self.assertEqual(self.accounts.pending_invitations(), 0)
        self.assertNotEqual(self.accounts.issue_invitation("testuser"), code)

    def test_expired_invitation_cannot_be_used(self):
        code = self.accounts.issue_invitation("testuser")
        with sqlite3.connect(self.db) as conn:
            conn.execute("UPDATE beta_invitations SET expires_at=0")
        with self.assertRaises(InvalidInvitation):
            self.accounts.register("testuser", "example-long-password", code)
        self.assertEqual(self.accounts.pending_invitations(), 0)

    def test_rejects_51st_registration_and_invitation(self):
        self._seed(MAX_BETA_ACCOUNTS)
        with self.assertRaises(BetaFull):
            self.accounts.issue_invitation("extra")
        self.assertEqual(self.accounts.count(), 50)

    def test_no_more_than_50_pending_invitations(self):
        for i in range(MAX_BETA_ACCOUNTS):
            self.accounts.issue_invitation(f"invite{i}")
        self.assertEqual(self.accounts.pending_invitations(), 50)
        with self.assertRaises(BetaFull):
            self.accounts.issue_invitation("invite50")
        self.assertEqual(self.accounts.count(), 0)

    def test_concurrent_final_invitation_only_one_wins(self):
        self._seed(MAX_BETA_ACCOUNTS - 1)

        def issue(i):
            try:
                return self.accounts.issue_invitation(f"extra{i}")
            except BetaFull:
                return None

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            codes = list(pool.map(issue, range(4)))
        self.assertEqual(sum(code is not None for code in codes), 1)
        self.assertEqual(self.accounts.count(), 49)
        self.assertEqual(self.accounts.pending_invitations(), 1)

    def test_concurrent_redeem_only_one_wins(self):
        code = self.accounts.issue_invitation("testuser")

        def register(_):
            try:
                self.accounts.register("testuser", "example-long-password", code)
                return True
            except InvalidInvitation:
                return False

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(register, range(4)))
        self.assertEqual(results.count(True), 1)
        self.assertEqual(results.count(False), 3)
        self.assertEqual(self.accounts.count(), 1)

    def test_memory_database_disallowed(self):
        with self.assertRaises(ValueError):
            BetaAccounts(":memory:")


if __name__ == "__main__":
    unittest.main()

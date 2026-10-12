"""SQLite-backed KERO beta account store.

Library only. Never enable public registration without durable storage,
invitation policy, authenticated sessions and rate limits.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import sqlite3
import time
import unicodedata
from contextlib import contextmanager
from pathlib import Path

MAX_BETA_ACCOUNTS = 50
_PBKDF2_ITERATIONS = 390_000
_USER_RE = re.compile(r"^[\w.-]{3,32}$", re.UNICODE)


class AccountAlreadyExists(ValueError):
    pass


class BetaFull(ValueError):
    pass


class InvalidAccount(ValueError):
    pass


class InvitationRequired(ValueError):
    pass


class InvalidInvitation(ValueError):
    pass


def _normalize(username: str) -> str:
    return unicodedata.normalize("NFKC", username.strip()).casefold()


def _validate(username: str, password: str) -> tuple[str, str]:
    username = unicodedata.normalize("NFKC", username.strip())
    key = _normalize(username)
    if not _USER_RE.fullmatch(username):
        raise InvalidAccount("Kullanıcı adı 3-32 karakter ve yalnızca harf, rakam, . _ - içermelidir.")
    if not isinstance(password, str) or len(password) < 12 or len(password) > 256:
        raise InvalidAccount("Şifre 12-256 karakter olmalıdır.")
    return username, key


def _password_hash(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)


class BetaAccounts:
    def __init__(self, database_path: str | Path):
        self.path = Path(database_path)
        if str(self.path) == ":memory:":
            raise ValueError("Üyelik verileri kalıcı diskte saklanmalıdır; :memory: desteklenmez.")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute("""CREATE TABLE IF NOT EXISTS beta_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                username_key TEXT NOT NULL UNIQUE,
                password_salt BLOB NOT NULL,
                password_hash BLOB NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
            conn.execute("""CREATE TABLE IF NOT EXISTS beta_invitations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token_digest TEXT NOT NULL UNIQUE,
                username_key TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                redeemed_at TEXT,
                redeemed_by INTEGER REFERENCES beta_accounts(id),
                revoked_at TEXT
            )""")
            conn.execute("""CREATE INDEX IF NOT EXISTS beta_invitations_status_idx
                ON beta_invitations(expires_at, redeemed_at, revoked_at)""")

    @contextmanager
    def _connect(self):
        conn = sqlite3.connect(str(self.path), timeout=30, isolation_level=None)
        try:
            conn.execute("PRAGMA busy_timeout=30000")
            conn.execute("PRAGMA journal_mode=WAL")
            yield conn
        finally:
            conn.close()

    def count(self) -> int:
        with self._connect() as conn:
            return int(conn.execute("SELECT COUNT(*) FROM beta_accounts").fetchone()[0])

    def pending_invitations(self) -> int:
        """Unused, unrevoked invitations which have not expired."""
        with self._connect() as conn:
            return int(conn.execute(
                "SELECT COUNT(*) FROM beta_invitations "
                "WHERE redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > ?",
                (int(time.time()),),
            ).fetchone()[0])

    def issue_invitation(self, username: str, *, days_valid: int = 7) -> str:
        """Owner-side operation only. Never expose through public registration.

        Reserves a beta slot and binds the code to the chosen username.
        This alone does not verify the recipient's real-world identity.
        """
        normalized = unicodedata.normalize("NFKC", username.strip())
        if not _USER_RE.fullmatch(normalized):
            raise InvalidAccount("Davet kullanıcı adı 3-32 karakter olmalıdır.")
        if not isinstance(days_valid, int) or not (1 <= days_valid <= 30):
            raise ValueError("Davet süresi 1-30 gün olmalıdır.")
        key = _normalize(normalized)
        token = secrets.token_urlsafe(32)
        digest = hashlib.sha256(token.encode("ascii")).hexdigest()
        now = int(time.time())
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                if conn.execute("SELECT id FROM beta_accounts WHERE username_key=?", (key,)).fetchone():
                    raise AccountAlreadyExists("Kullanıcı zaten kayıtlı.")
                if conn.execute(
                    "SELECT id FROM beta_invitations WHERE username_key=? "
                    "AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?",
                    (key, now),
                ).fetchone():
                    raise AccountAlreadyExists("Bu kullanıcı adına aktif davet zaten var.")
                accounts = conn.execute("SELECT COUNT(*) FROM beta_accounts").fetchone()[0]
                invites = conn.execute(
                    "SELECT COUNT(*) FROM beta_invitations WHERE "
                    "redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?", (now,)
                ).fetchone()[0]
                if accounts + invites >= MAX_BETA_ACCOUNTS:
                    raise BetaFull("50 kişilik beta kontenjanında boş davet yeri kalmadı.")
                conn.execute(
                    "INSERT INTO beta_invitations(token_digest, username_key, expires_at) VALUES (?,?,?)",
                    (digest, key, now + days_valid * 86400),
                )
                conn.execute("COMMIT")
                return token
            except BaseException:
                conn.execute("ROLLBACK")
                raise

    def revoke_invitation(self, token: str) -> bool:
        """Owner-side operation; only unused invitations can be revoked."""
        if not isinstance(token, str) or len(token) > 256:
            return False
        digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                updated = conn.execute(
                    "UPDATE beta_invitations SET revoked_at=CURRENT_TIMESTAMP "
                    "WHERE token_digest=? AND redeemed_at IS NULL AND revoked_at IS NULL",
                    (digest,),
                ).rowcount
                conn.execute("COMMIT")
                return bool(updated)
            except BaseException:
                conn.execute("ROLLBACK")
                raise

    def register(self, username: str, password: str, invite_code: str | None = None) -> int:
        """Accept an owner's single-use invitation and register atomically.

        No open registration route is provided. The invitation is mandatory.
        """
        if not invite_code or not isinstance(invite_code, str) or len(invite_code) > 256:
            raise InvitationRequired("KERO Beta üyeliği yalnızca davet koduyla açılabilir.")
        display, key = _validate(username, password)
        digest = hashlib.sha256(invite_code.encode("utf-8")).hexdigest()
        salt = secrets.token_bytes(16)
        hashed = _password_hash(password, salt)
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                row = conn.execute(
                    "SELECT id, username_key, expires_at, redeemed_at, revoked_at "
                    "FROM beta_invitations WHERE token_digest=?",
                    (digest,),
                ).fetchone()
                if (not row or row[1] != key or row[2] <= int(time.time())
                        or row[3] is not None or row[4] is not None):
                    raise InvalidInvitation("Davet geçersiz, süresi dolmuş veya kullanılmış.")
                if conn.execute("SELECT id FROM beta_accounts WHERE username_key=?", (key,)).fetchone():
                    raise AccountAlreadyExists("Kullanıcı adı zaten kayıtlı.")
                if conn.execute("SELECT COUNT(*) FROM beta_accounts").fetchone()[0] >= MAX_BETA_ACCOUNTS:
                    raise BetaFull("KERO Beta 1.0 için 50 kullanıcı sınırına ulaşıldı.")
                cursor = conn.execute(
                    "INSERT INTO beta_accounts(username, username_key, password_salt, password_hash) "
                    "VALUES (?,?,?,?)",
                    (display, key, salt, hashed),
                )
                conn.execute(
                    "UPDATE beta_invitations SET redeemed_at=CURRENT_TIMESTAMP, redeemed_by=? WHERE id=?",
                    (int(cursor.lastrowid), row[0]),
                )
                conn.execute("COMMIT")
                return int(cursor.lastrowid)
            except BaseException:
                conn.execute("ROLLBACK")
                raise

    def authenticate(self, username: str, password: str) -> int | None:
        key = _normalize(username)
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, password_salt, password_hash FROM beta_accounts WHERE username_key=?", (key,)
            ).fetchone()
        salt = row[1] if row else b"\0" * 16
        candidate = _password_hash(password, salt)
        if row and hmac.compare_digest(candidate, row[2]):
            return int(row[0])
        return None

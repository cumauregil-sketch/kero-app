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

    def register(self, username: str, password: str) -> int:
        """Atomically rejects the 51st registration even for simultaneous signups."""
        display, key = _validate(username, password)
        salt = secrets.token_bytes(16)
        hashed = _password_hash(password, salt)
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                if conn.execute("SELECT id FROM beta_accounts WHERE username_key=?", (key,)).fetchone():
                    raise AccountAlreadyExists("Kullanıcı adı zaten kayıtlı.")
                if conn.execute("SELECT COUNT(*) FROM beta_accounts").fetchone()[0] >= MAX_BETA_ACCOUNTS:
                    raise BetaFull("KERO Beta 1.0 için 50 kullanıcı sınırına ulaşıldı.")
                cursor = conn.execute(
                    "INSERT INTO beta_accounts(username, username_key, password_salt, password_hash) VALUES (?,?,?,?)",
                    (display, key, salt, hashed),
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

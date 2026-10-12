# KERO Beta 1.0: 50 registered accounts

## Agreed beta limit

- Strict server-side maximum: **50 registered accounts**.
- After the 50th account registers, a 51st account is rejected.
- Existing registered accounts may still sign in after the limit is reached.
- Atomic SQLite `BEGIN IMMEDIATE` transactions stop two simultaneous attempts from taking the final available slot.
- Passwords are stored as salted PBKDF2-HMAC-SHA256 hashes, never plaintext.
- Usernames are normalized, unique and case-insensitive.

## What is actually implemented

The new `backend/app/beta_accounts.py` module is a standalone account storage component, with unit tests for persistence, password verification, uniqueness, 51st registration rejection, and competing signups.

**This does not yet implement a complete signup/login flow.** There is deliberately no public signup API route, no authentication session/cookie, no UI, no invitation approval and no production activation. Current KERO chat still uses the shared pilot access code.

## Production blockers to resolve before activating it

1. A **persistent, backed-up storage location**, not an ephemeral Railway container filesystem. A shared database may be safer if we scale beyond one API instance.
2. An **invite-only registration and owner approval** flow to prevent random users occupying the 50 beta slots.
3. Secure sessions, login throttling, account deletion, and recoverable password reset.
4. Registration/login screens and account-bound chat access.
5. Verify hosting and inference remain at **zero added cost** before enabling service.

A total of 50 registered people does **not** mean 50 simultaneous AI requests can be serviced quickly or for free. The independent/self-hosted KERO model is a separate infrastructure decision and has not been built by this PR.

## Run local unit tests

```bash
cd backend
python -m unittest discover -s tests -p test_beta_accounts.py -v
```

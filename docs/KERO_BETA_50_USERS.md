# KERO Beta 1.0: 50 registered accounts

## Agreed beta limit

- Strict server-side maximum: **50 registered accounts**.
- Only the owner can create invitations for specific usernames; open signups are forbidden.
- Invite codes are single-use, expiring, revocable and stored as SHA-256 digests (never plaintext).
- Active invitations reserve beta slots: registered accounts plus unexpired, unused, unrevoked invitations can never exceed 50.
- After the 50th account registers, a 51st account is rejected.
- Existing registered accounts may still sign in after the limit is reached.
- Atomic SQLite `BEGIN IMMEDIATE` transactions stop two simultaneous attempts from taking the final available slot.
- Passwords are stored as salted PBKDF2-HMAC-SHA256 hashes, never plaintext.
- Usernames are normalized, unique and case-insensitive.

## What is actually implemented

The new `backend/app/beta_accounts.py` module is a standalone account storage component. `issue_invitation(username)` is for an authorized owner/admin flow only; `register(username, password, invite_code)` requires that invitation. Invite codes are tied to the username and are valid for 7 days by default, up to 30 days. Both issuing and redemption use database transactions to prevent overbooking and duplicate redemption. Offline tests cover persistence, password verification, slot limits, invite expiry and revocation, concurrent issuance, and double redemption.

**This does not yet implement a complete signup/login flow.** There is deliberately no public signup API route, no authentication session/cookie, no UI, no admin invitation UI, no recipient identity verification and no production activation. Current KERO chat still uses the shared pilot access code.

## Production blockers to resolve before activating it

1. A **persistent, backed-up storage location**, not an ephemeral Railway container filesystem. A shared database may be safer if we scale beyond one API instance.
2. An **owner-authenticated invitation management screen** for issuing/revoking codes and verifying invitee email/phone. A username-bound code alone cannot prove it reached the chosen person.
3. Secure sessions, login/registration throttling, account deletion policy, and recoverable password reset.
4. Registration/login screens and account-bound chat access.
5. Verify hosting and inference remain at **zero added cost** before enabling service.

A total of 50 registered people does **not** mean 50 simultaneous AI requests can be serviced quickly or for free. The independent/self-hosted KERO model is a separate infrastructure decision and has not been built by this PR.

## Run local unit tests

```bash
cd backend
python -m unittest discover -s tests -p test_beta_accounts.py -v
```


## Owner invitation flow (not connected to public API yet)

1. Owner chooses the invitee's username, e.g. `demo_user`.
2. Owner-only backend method `issue_invitation("demo_user")` creates a randomly generated secret invitation code, returning the plaintext **once**.
3. Owner gives that code privately to the intended beta tester. Production needs verified contact delivery to avoid forwarding/impersonation.
4. Registration submits the assigned username, password and invite code together; account creation and code redemption happen atomically.
5. The owner can revoke an unused invitation. Expired/revoked invitations release their reserved beta slot.

Never place invitation codes, API keys or passwords in GitHub commits or application logs. Until there is a durable database, verified invitations and secure login sessions, do not deploy public registration.

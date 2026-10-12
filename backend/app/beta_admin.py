"""Owner-only KERO beta dashboard API; disabled unless explicitly configured."""
import hmac
import os
import time

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from .beta_accounts import (
    BetaAccounts, AccountAlreadyExists, InvalidAccount, BetaFull,
    MAX_BETA_ACCOUNTS,
)

router = APIRouter(prefix="/api/beta/admin", tags=["beta-admin"])


class CreateInvitation(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    days_valid: int = Field(default=7, ge=1, le=30)


def require_owner(request: Request, x_kero_beta_admin_token: str | None = Header(default=None)) -> BetaAccounts:
    """No public administration without owner key and explicitly configured durable database."""
    enabled = os.getenv("KERO_BETA_ENABLED", "").strip().lower() == "true"
    database = os.getenv("KERO_BETA_DB_PATH", "").strip()
    secret = os.getenv("KERO_BETA_ADMIN_TOKEN", "").strip()
    persistent_confirmed = os.getenv("KERO_BETA_STORAGE_READY", "").strip().lower() == "true"
    if not (enabled and persistent_confirmed and database and len(secret) >= 32):
        raise HTTPException(status_code=503, detail="Beta yönetimi henüz güvenli biçimde yapılandırılmadı.")
    if not x_kero_beta_admin_token or not hmac.compare_digest(x_kero_beta_admin_token, secret):
        raise HTTPException(status_code=401, detail="Yönetici anahtarı geçersiz.")
    return BetaAccounts(database)


def invitation_items(store: BetaAccounts) -> list[dict]:
    now = int(time.time())
    with store._connect() as conn:
        rows = conn.execute(
            "SELECT id, username_key, created_at, expires_at, redeemed_at, revoked_at "
            "FROM beta_invitations ORDER BY id DESC"
        ).fetchall()
    return [
        {"id": item[0], "username": item[1], "created_at": item[2], "expires_at": item[3],
         "status": "used" if item[4] is not None else (
             "revoked" if item[5] is not None else ("expired" if item[3] <= now else "pending")
         )}
        for item in rows
    ]


@router.get("/status")
def status(store: BetaAccounts = Depends(require_owner)):
    accounts = store.count()
    pending = store.pending_invitations()
    return {"capacity": MAX_BETA_ACCOUNTS, "registered": accounts,
            "reserved": pending, "available": max(0, MAX_BETA_ACCOUNTS - accounts - pending)}


@router.get("/invitations")
def invitations(store: BetaAccounts = Depends(require_owner)):
    return {"invitations": invitation_items(store)}


@router.post("/invitations", status_code=201)
def create_invitation(payload: CreateInvitation, store: BetaAccounts = Depends(require_owner)):
    try:
        code = store.issue_invitation(payload.username, days_valid=payload.days_valid)
    except BetaFull as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (InvalidAccount, AccountAlreadyExists, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"username": payload.username, "code": code, "days_valid": payload.days_valid}


@router.post("/invitations/{invitation_id}/revoke")
def revoke_invitation(invitation_id: int, store: BetaAccounts = Depends(require_owner)):
    if invitation_id <= 0:
        raise HTTPException(status_code=404, detail="Davet bulunamadı.")
    with store._connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        try:
            changed = conn.execute(
                "UPDATE beta_invitations SET revoked_at=CURRENT_TIMESTAMP "
                "WHERE id=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > ?",
                (invitation_id, int(time.time())),
            ).rowcount
            conn.execute("COMMIT")
        except BaseException:
            conn.execute("ROLLBACK")
            raise
    if not changed:
        raise HTTPException(status_code=404, detail="Aktif davet bulunamadı.")
    return {"revoked": True}

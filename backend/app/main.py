import asyncio
import hmac
import logging
import os
import time
from collections import deque

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .task_router import InvalidRouteError, RoutePlan, propose_route
from .planner import PlannerReplyError, create_plan
from .orchestrator import maybe_delegate_planning

PLANNING_DEADLINE_SECONDS = 24.0
logger = logging.getLogger("uvicorn.error")

app = FastAPI(title="KERO API", version="0.2.1")
# Pilot-only per-IP throttling, per-worker. Replace with account quotas before public launch.
request_times: dict[str, deque[float]] = {}

origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class Message(BaseModel):
    role: str
    content: str = Field(min_length=1, max_length=4000)

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[Message] = Field(default_factory=list, max_length=16)

class ChatResponse(BaseModel):
    reply: str

@app.get("/health")
def health():
    return {"status": "ok", "service": "kero-api", "ai_ready": bool(os.getenv("GEMINI_API_KEY") and os.getenv("KERO_ACCESS_CODE"))}

@app.post("/api/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, request: Request, x_kero_access_code: str | None = Header(default=None)):
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    pilot_code = os.getenv("KERO_ACCESS_CODE", "").strip()
    if not api_key or not pilot_code:
        return ChatResponse(reply="KERO'nun yapay zekâ bağlantısı henüz etkin değil. Yönetici yapılandırması gerekiyor.")
    if not x_kero_access_code or not hmac.compare_digest(x_kero_access_code, pilot_code):
        raise HTTPException(status_code=401, detail="KERO özel test erişim kodu gerekli.")
    client_ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    times = request_times.setdefault(client_ip, deque())
    while times and now - times[0] > 60:
        times.popleft()
    if len(times) >= 30:
        raise HTTPException(status_code=429, detail="Çok fazla mesaj gönderildi. Bir dakika sonra tekrar dene.")
    times.append(now)
    model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
    if model not in ("gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.8-flash"):
        raise HTTPException(status_code=503, detail="Model yapılandırması geçersiz.")
    # Specialist routing is opt-in and off in production until explicitly enabled.
    # A failure in either provider must not break the existing Gemini conversation.
    if (
        os.getenv("KERO_ENABLE_MULTI_AI", "false").strip().lower() == "true"
        and os.getenv("OPENROUTER_API_KEY", "").strip()
    ):
        try:
            delegated = await asyncio.wait_for(
                maybe_delegate_planning(
                    payload.message,
                    gemini_key=api_key,
                    gemini_model=model,
                    openrouter_key=os.environ["OPENROUTER_API_KEY"].strip(),
                    history=[
                        {"role": m.role, "content": m.content}
                        for m in payload.history[-6:]
                        if m.role in ("user", "assistant")
                    ],
                ),
                timeout=PLANNING_DEADLINE_SECONDS,
            )
            if delegated is not None:
                return ChatResponse(reply=delegated)
        except TimeoutError:
            logger.warning(
                "kero_specialist status=timeout budget_ms=%d fallback=gemini",
                round(PLANNING_DEADLINE_SECONDS * 1000),
            )
        except (httpx.HTTPError, ValueError):
            logger.warning("kero_specialist status=error fallback=gemini")
        # On specialist failure or deadline, use the existing Gemini chat path.

    # Never send the static UI greeting as a model turn at the start.
    turns = []
    for m in payload.history[-12:]:
        if m.role not in ("user", "assistant"):
            continue
        role = "model" if m.role == "assistant" else "user"
        if not turns and role != "user":
            continue
        if turns and turns[-1]["role"] == role:
            turns[-1]["parts"][0]["text"] += "\\n" + m.content
        else:
            turns.append({"role": role, "parts": [{"text": m.content}]})
    turns.append({"role": "user", "parts": [{"text": payload.message}]})
    body = {
        "systemInstruction": {"parts": [{"text": "Sen KERO'sun. Doğal, sıcak ve akıcı Türkçe konuş. Gerçek soruya yanıt ver; mekanik test mesajları üretme. Yapmadığın eylemleri yaptığını söyleme. Gerektiğinde bilmediğini belirt."}]},
        "contents": turns,
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2048},
    }
    try:
        async with httpx.AsyncClient(timeout=40) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                json=body, headers={"x-goog-api-key": api_key},
            )
        response.raise_for_status()
        data = response.json()
        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        reply = "".join(p.get("text", "") for p in parts if isinstance(p, dict) and not p.get("thought")).strip()
        if not reply:
            raise HTTPException(status_code=502, detail="Model yanıt üretemedi.")
        return ChatResponse(reply=reply)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 400:
            raise HTTPException(status_code=503, detail="Yapay zekâ isteği sağlayıcı tarafından reddedildi. Bağlantı ayarlarını kontrol et.") from exc
        if exc.response.status_code in (401, 403, 404):
            raise HTTPException(status_code=503, detail="Gemini modeli veya API anahtarı kullanılamıyor. Yapılandırmayı kontrol et.") from exc
        if exc.response.status_code == 429:
            raise HTTPException(status_code=429, detail="Yapay zekâ kullanım kotası doldu.") from exc
        raise HTTPException(status_code=502, detail="Yapay zekâ sağlayıcısına bağlanılamadı.") from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail="Yapay zekâ ağına ulaşılamadı.") from exc


class RoutePreviewResponse(BaseModel):
    status: str = "preview"
    execution: str = "not_started"
    plan: RoutePlan


@app.post("/api/route-preview", response_model=RoutePreviewResponse)
async def route_preview(
    payload: ChatRequest,
    request: Request,
    x_kero_access_code: str | None = Header(default=None),
):
    """Plan a route without invoking specialists, editing files or deploying code."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    pilot_code = os.getenv("KERO_ACCESS_CODE", "").strip()
    if not api_key or not pilot_code:
        raise HTTPException(status_code=503, detail="Görev yöneticisi henüz yapılandırılmadı.")
    if not x_kero_access_code or not hmac.compare_digest(x_kero_access_code, pilot_code):
        raise HTTPException(status_code=401, detail="KERO özel test erişim kodu gerekli.")

    # Separate, conservative throttle for the opt-in preview endpoint.
    client_ip = request.client.host if request.client else "unknown"
    rate_key = "route:" + client_ip
    now = time.monotonic()
    times = request_times.setdefault(rate_key, deque())
    while times and now - times[0] > 60:
        times.popleft()
    if len(times) >= 10:
        raise HTTPException(status_code=429, detail="Görev planı istek sınırına ulaşıldı.")
    times.append(now)

    model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
    if model not in ("gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.8-flash"):
        raise HTTPException(status_code=503, detail="Model yapılandırması geçersiz.")
    try:
        plan = await propose_route(payload.message, api_key=api_key, model=model)
    except InvalidRouteError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            raise HTTPException(status_code=429, detail="Yapay zekâ kullanım kotası doldu.") from exc
        raise HTTPException(status_code=502, detail="Gemini görev planı üretemedi.") from exc
    except (httpx.RequestError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Görev yönlendirme bağlantısı başarısız.") from exc
    return RoutePreviewResponse(plan=plan)


class PlannerPreviewResponse(BaseModel):
    status: str = "preview"
    model: str = "nvidia/nemotron-3-ultra-550b-a55b:free"
    execution: str = "text_plan_only"
    plan: str


@app.post("/api/planner-preview", response_model=PlannerPreviewResponse)
async def planner_preview(
    payload: ChatRequest,
    request: Request,
    x_kero_access_code: str | None = Header(default=None),
):
    """A separately gated planning test; does not alter the live chat flow."""
    if os.getenv("KERO_ENABLE_PLANNER_PREVIEW", "false").lower() != "true":
        raise HTTPException(status_code=404, detail="Planlama önizlemesi etkin değil.")
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    access_code = os.getenv("KERO_ACCESS_CODE", "").strip()
    if not api_key or not access_code:
        raise HTTPException(status_code=503, detail="Planlama bağlantısı yapılandırılmadı.")
    if not x_kero_access_code or not hmac.compare_digest(x_kero_access_code, access_code):
        raise HTTPException(status_code=401, detail="KERO özel test erişim kodu gerekli.")

    # Opt-in preview calls consume free quota; cap bursts conservatively.
    client_ip = request.client.host if request.client else "unknown"
    rate_key = "planner:" + client_ip
    now = time.monotonic()
    times = request_times.setdefault(rate_key, deque())
    while times and now - times[0] > 60:
        times.popleft()
    if len(times) >= 3:
        raise HTTPException(status_code=429, detail="Planlama deneme sınırına ulaşıldı.")
    times.append(now)

    try:
        plan = await create_plan(payload.message, api_key=api_key)
    except PlannerReplyError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if status in (401, 403):
            raise HTTPException(status_code=503, detail="OpenRouter API anahtarı geçersiz veya yetkisiz.") from exc
        if status == 402:
            raise HTTPException(status_code=503, detail="OpenRouter anahtarının harcama sınırı veya kredi ayarları isteği engelliyor.") from exc
        if status == 429:
            raise HTTPException(status_code=429, detail="OpenRouter ücretsiz kullanım kotası doldu.") from exc
        raise HTTPException(status_code=502, detail="Ücretsiz planlama servisi yanıt vermedi.") from exc
    except (httpx.RequestError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Planlama servisine erişilemedi.") from exc
    return PlannerPreviewResponse(plan=plan)

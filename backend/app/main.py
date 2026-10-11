import hmac
import os

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="KERO API", version="0.2.0")
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
async def chat(payload: ChatRequest, x_kero_access_code: str | None = Header(default=None)):
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    pilot_code = os.getenv("KERO_ACCESS_CODE", "").strip()
    if not api_key or not pilot_code:
        return ChatResponse(reply="KERO'nun yapay zekâ bağlantısı henüz etkin değil. Yönetici yapılandırması gerekiyor.")
    if not x_kero_access_code or not hmac.compare_digest(x_kero_access_code, pilot_code):
        raise HTTPException(status_code=401, detail="KERO özel test erişim kodu gerekli.")
    model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
    if model not in ("gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.8-flash"):
        raise HTTPException(status_code=503, detail="Model yapılandırması geçersiz.")
    turns = [
        {"role": "model" if m.role == "assistant" else "user", "parts": [{"text": m.content}]}
        for m in payload.history[-12:] if m.role in ("user", "assistant")
    ]
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
        if exc.response.status_code == 429:
            raise HTTPException(status_code=429, detail="Yapay zekâ kullanım kotası doldu.") from exc
        raise HTTPException(status_code=502, detail="Yapay zekâ sağlayıcısına bağlanılamadı.") from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail="Yapay zekâ ağına ulaşılamadı.") from exc

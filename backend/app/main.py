import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="KERO API", version="0.1.0")

origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10000)

class ChatResponse(BaseModel):
    reply: str

@app.get("/health")
def health():
    return {"status": "ok", "service": "kero-api"}

@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest):
    # V0 echo path. LangGraph/LiteLLM orchestration plugs in here next.
    return ChatResponse(reply=f"Mesajını aldım: {payload.message}")

# KERO

KERO is a Turkish-first AI assistant platform with a premium dark chat interface and a dedicated voice-conversation mode.

## Active product architecture
- **Primary interface:** text chat, with saved conversation on the current device.
- **Voice interface:** microphone button opens a dedicated voice overlay with an animated abstract sphere.
- **No human character:** previous silhouette, face, mouth motion and video-based avatar flows are retired and must not be reintroduced.
- **Frontend:** Next.js 15, React 19, TypeScript.
- **Backend:** FastAPI.
- **Deploy:** Railway.
- **Future orchestration:** multi-model routing and specialist agents behind one KERO identity.

## Current limitations
- The backend currently returns an echo response ('Mesajını aldım'); live LLM integration is not done.
- Voice input/output uses browser speech services. Browser support and voice quality vary.
- Conversation history is stored in localStorage on this device, not synced to user accounts.

## Local development

Backend:
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. Set RAILWAY_SERVICE_KERO_API_URL in frontend deployment to point to the running backend.

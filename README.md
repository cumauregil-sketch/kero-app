# KERO

KERO AI assistant starter monorepo.

## Stack
- Frontend: Next.js + TypeScript
- Backend: FastAPI
- Deployment target: Railway
- Agent layer (next phase): LangGraph + LiteLLM

## Local development

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Open http://localhost:3000

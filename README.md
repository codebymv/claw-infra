# ZeroClaw Dashboard Infrastructure

Real-time dashboard for monitoring ZeroClaw agent runs, resource usage, costs, and logs.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS + Recharts |
| Backend | NestJS + TypeORM |
| Database | PostgreSQL |
| Realtime | WebSockets (Socket.io) + Redis pub/sub |
| Auth | JWT (dashboard) + API key (agent ingestion) |
| Deploy | Railway (or Docker Compose locally) |

## Quick Start (Local)

```bash
# 1. Start Postgres + Redis
docker compose up postgres redis -d

# 2. Start backend
cd backend
cp .env.example .env
npm install
npm run start:dev

# 3. Start frontend (new terminal)
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Dashboard: http://localhost:3001  
Backend API: http://localhost:3000/api

## Registering Your First User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123","displayName":"Admin"}'
```

## Creating an Agent API Key

1. Log into the dashboard at http://localhost:3001
2. Go to **Settings → Agent API Keys**
3. Enter a name and click **Create**
4. Copy the key — it won't be shown again

## Agent Integration

Your ZeroClaw agents report to these endpoints using `X-Agent-Token: <your-key>`:

```
POST /api/ingest/runs              # Create a run
POST /api/ingest/runs/:id/start    # Mark run as started
PATCH /api/ingest/runs/:id/status  # Update run status
POST /api/ingest/runs/:runId/steps # Create a step
PATCH /api/ingest/steps/:id/status # Update step status
POST /api/ingest/costs             # Record a cost event
POST /api/ingest/logs              # Send a log entry
POST /api/ingest/logs/batch        # Send multiple logs
POST /api/ingest/metrics           # Report resource snapshot
```

### Example — reporting a run

```python
import requests

BASE = "http://your-backend/api"
HEADERS = {"X-Agent-Token": "your-agent-key", "Content-Type": "application/json"}

# 1. Create run
run = requests.post(f"{BASE}/ingest/runs", headers=HEADERS, json={
    "agentName": "my-zeroclaw-agent",
    "trigger": "manual"
}).json()

# 2. Start it
requests.post(f"{BASE}/ingest/runs/{run['id']}/start", headers=HEADERS)

# 3. Report a step
step = requests.post(f"{BASE}/ingest/runs/{run['id']}/steps", headers=HEADERS, json={
    "stepIndex": 0, "toolName": "web_search", "stepName": "Search for context"
}).json()

# 4. Report cost
requests.post(f"{BASE}/ingest/costs", headers=HEADERS, json={
    "runId": run["id"], "stepId": step["id"],
    "provider": "openai", "model": "gpt-4o",
    "tokensIn": 1500, "tokensOut": 320,
    "costUsd": "0.002360"
})

# 5. Complete the run
requests.patch(f"{BASE}/ingest/runs/{run['id']}/status", headers=HEADERS, json={
    "status": "completed", "durationMs": 4200,
    "totalTokensIn": 1500, "totalTokensOut": 320, "totalCostUsd": "0.002360"
})
```

## ZeroClaw Agent Service

The `agent/` directory contains a reporter sidecar that:
1. Generates `config.toml` from env vars at startup
2. Spawns `zeroclaw daemon` as a child process
3. Parses structured log output into typed events (runs, steps, LLM calls)
4. Reports everything to the claw-infra backend via the ingest API
5. Collects and reports container resource metrics every 15s

On Railway, the agent talks to the backend via `BACKEND_INTERNAL_URL`. Use your backend's **public URL** (e.g. `https://backend-production-xxx.up.railway.app`) if internal hostnames (`backend`, `backend.railway.internal`) fail to resolve. You control the agent remotely via **Telegram** (ZeroClaw's native channel support).

### Local testing (requires ZeroClaw installed)

```bash
cd agent
cp .env.example .env
# Edit .env with your API keys and agent token
npm install && npm run dev
```

### Docker Compose

```bash
# Start with agent service
docker compose --profile agent up
```

## Deploy to Railway

1. Push this repo to GitHub
2. Create a new Railway project
3. Add a **PostgreSQL** and **Redis** database
4. Add three services:
   - `backend` → root directory `backend/`, add env vars
   - `frontend` → root directory `frontend/`, add env vars
   - `agent` → root directory `agent/`, add env vars

### Backend env vars
```
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
JWT_SECRET=<random 64-char string>
FRONTEND_URL=https://your-frontend.up.railway.app
ALLOWED_IPS=<your-public-ip>
IP_ALLOWLIST_ENABLED=true
REGISTRATION_ENABLED=false
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_CHAT_ID=<your chat id>
```

### Frontend env vars
```
NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app
NEXT_PUBLIC_WS_URL=https://your-backend.up.railway.app
```

### Agent env vars
```
# Use backend's public URL if internal hostname doesn't resolve
BACKEND_INTERNAL_URL=https://your-backend.up.railway.app
AGENT_API_KEY=<agent key from dashboard settings>
ZEROCLAW_AGENT_NAME=zeroclaw-primary
ZEROCLAW_API_KEY=<your OpenRouter key>
ZEROCLAW_PROVIDER=openrouter
ZEROCLAW_MODEL=anthropic/claude-sonnet-4-6
ZEROCLAW_TELEGRAM_BOT_TOKEN=<agent bot token>
ZEROCLAW_TELEGRAM_ALLOWED_USERS=<your telegram user id>
ZEROCLAW_AUTONOMY=supervised
# Prebuilt binary only supports sqlite (not postgres)
ZEROCLAW_MEMORY_BACKEND=sqlite
# Required for the agent to clone/read GitHub repos (public or private).
# Create at https://github.com/settings/tokens — needs Contents + Metadata read access.
GITHUB_TOKEN=ghp_...
```

## Pages

| Route | Description |
|---|---|
| `/` | Dashboard home — summary stats, charts, active runs |
| `/agents` | All agent runs with filtering and pagination |
| `/agents/[runId]` | Run detail — step timeline, live logs, cost breakdown |
| `/costs` | Cost analytics — by model, by agent, trend, projections |
| `/resources` | Resource monitor — live gauges, CPU/memory history |
| `/settings` | API key management, budget configuration |

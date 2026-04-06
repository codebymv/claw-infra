# Claw-Infra Deployment Runbook

## Overview

This runbook covers deployment procedures for the claw-infra platform, including backend, frontend, and agent services.

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ for local development
- PostgreSQL 16 database
- Redis 7 instance
- Railway CLI (for production deployment)

## Environment Variables

### Backend Required

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Redis
REDIS_URL=redis://host:6379

# Auth
JWT_SECRET=<64-character-secret>

# CORS
FRONTEND_URL=https://your-frontend.com
CORS_ORIGINS=https://extra-origin.com

# Optional security
IP_ALLOWLIST_ENABLED=true
ALLOWED_IPS=1.2.3.4,5.6.7.8
REGISTRATION_ENABLED=false

# Idempotency (recommended)
INGEST_IDEMPOTENCY_ENABLED=true
INGEST_IDEMPOTENCY_TTL_HOURS=24

# Telegram alerts (optional)
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id
```

### Frontend Required

```bash
NEXT_PUBLIC_API_URL=https://your-backend.com
NEXT_PUBLIC_WS_URL=wss://your-backend.com
```

### Agent Required

```bash
BACKEND_INTERNAL_URL=https://your-backend.com
AGENT_API_KEY=<from dashboard settings>
ZEROCLAW_AGENT_NAME=zeroclaw-primary
ZEROCLAW_API_KEY=<openrouter-key>
ZEROCLAW_PROVIDER=openrouter
ZEROCLAW_MODEL=anthropic/claude-sonnet-4
ZEROCLAW_TELEGRAM_BOT_TOKEN=<optional>
ZEROCLAW_TELEGRAM_ALLOWED_USERS=<user-id>
GITHUB_TOKEN=ghp_...
```

## Local Development

### Start Dependencies

```bash
docker compose up postgres redis -d
```

### Start Backend

```bash
cd backend
cp .env.example .env
npm install
npm run start:dev
```

### Start Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

### Start Agent (requires ZeroClaw binary)

```bash
cd agent
cp .env.example .env
npm install
npm run dev
```

## Production Deployment (Railway)

### 1. Create Project

```bash
railway login
railway project create claw-infra
```

### 2. Add Databases

```bash
railway add --database postgres
railway add --database redis
```

### 3. Deploy Backend

```bash
railway service create backend
railway up --service backend ./backend

# Set environment variables
railway variables set --service backend \
  DATABASE_URL='${{Postgres.DATABASE_URL}}' \
  REDIS_URL='${{Redis.REDIS_URL}}' \
  JWT_SECRET='$(openssl rand -hex 64)' \
  FRONTEND_URL='https://your-frontend.railway.app'

railway deploy --service backend
```

### 4. Deploy Frontend

```bash
railway service create frontend
railway up --service frontend ./frontend

railway variables set --service frontend \
  NEXT_PUBLIC_API_URL='https://your-backend.railway.app' \
  NEXT_PUBLIC_WS_URL='https://your-backend.railway.app'

railway deploy --service frontend
```

### 5. Deploy Agent (Optional)

```bash
railway service create agent
railway up --service agent ./agent

railway variables set --service agent \
  BACKEND_INTERNAL_URL='https://your-backend.railway.app' \
  AGENT_API_KEY='<from dashboard>' \
  # ... other agent vars

railway deploy --service agent
```

### 6. Create API Key

```bash
# First user registration (if enabled)
curl -X POST https://your-backend.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"secure-password","displayName":"Admin"}'

# Login and create agent API key via dashboard
# Go to Settings → Agent API Keys → Create
```

## Health Checks

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/health` | Full health check (db, redis, migrations) |
| `/api/health/ready` | Readiness (migrations complete) |
| `/api/health/live` | Liveness (process running) |

### Expected Responses

```json
// GET /api/health
{
  "status": "ok" | "degraded" | "down",
  "checks": {
    "db": "ok",
    "redis": "ok",
    "migrations": "ok"
  },
  "timestamp": "2024-01-15T12:00:00Z"
}

// GET /api/health/ready
{
  "status": "ready",
  "timestamp": "2024-01-15T12:00:00Z"
}
```

## Monitoring

### Key Metrics

- **Backend**: Response time, error rate, db connections
- **WebSocket**: Connection count, message throughput
- **Agent**: Run completion rate, cost per run, latency

### Alerts (via Telegram)

Configure `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to receive alerts for:
- Run failures
- High error rates
- Budget threshold breaches

## Troubleshooting

### Backend Won't Start

1. Check migrations: `npm run migration:run`
2. Verify DB connection: `npm run db:health`
3. Check Redis: `redis-cli ping`

### WebSocket Not Connecting

1. Verify `FRONTEND_URL` matches the frontend origin
2. Check `NEXT_PUBLIC_WS_URL` points to backend
3. Verify CORS settings

### Agent Not Reporting

1. Check `BACKEND_INTERNAL_URL` is accessible
2. Verify `AGENT_API_KEY` is valid
3. Check health: `curl $BACKEND_INTERNAL_URL/api/health`

### Database Migration Issues

```bash
# Revert last migration
npm run migration:revert

# Generate migration from entities
npm run migration:generate

# Run pending migrations
npm run migration:run
```

## Rollback Procedure

### Quick Rollback

```bash
# Railway
railway rollback --service backend
railway rollback --service frontend
```

### Database Rollback

```bash
# Connect to database
railway connect postgres

# Revert migrations
psql> -- Manual SQL if needed
```

## Maintenance Mode

### Enable Maintenance Mode

```bash
# Set environment variable
railway variables set --service backend MAINTENANCE_MODE=true

# Deploy
railway deploy --service backend
```

### Disable Maintenance Mode

```bash
railway variables set --service backend MAINTENANCE_MODE=false
railway deploy --service backend
```

## Backup & Recovery

### Database Backup

```bash
# PostgreSQL dump
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Restore
psql $DATABASE_URL < backup.sql
```

### Redis Backup

```bash
# Trigger RDB save
redis-cli BGSAVE

# Copy dump file
cp /var/lib/redis/dump.rdb redis-backup-$(date +%Y%m%d).rdb
```

## Security Checklist

- [ ] `JWT_SECRET` is 64+ characters
- [ ] `REGISTRATION_ENABLED=false` in production
- [ ] `IP_ALLOWLIST_ENABLED=true` for admin-only access
- [ ] HTTPS enforced on all endpoints
- [ ] API keys rotated quarterly
- [ ] Database backups configured
- [ ] Rate limiting enabled (`ThrottlerModule`)
- [ ] CORS properly configured

## Support

- **Logs**: Railway dashboard → Service → Logs
- **Metrics**: Railway dashboard → Service → Metrics
- **Events**: Backend emits structured logs via `LoggingInterceptor`
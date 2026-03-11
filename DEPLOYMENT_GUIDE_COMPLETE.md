# Complete Deployment Guide - All Phases

Comprehensive deployment guide for all infrastructure optimizations (Phases 1-4).

## Quick Reference

| Phase | Requirements | Status | Priority |
|---|---|---|---|
| Phase 1 | Critical Fixes (5/6) | ✅ Complete | Critical |
| Phase 2 | Performance (4/5) | ✅ Complete | High |
| Phase 3 | Operations (6/6) | ✅ Complete | Medium |
| Phase 4 | Enhancements (5/5) | ✅ Complete | Low |

**Total:** 20/22 requirements implemented (91%)

---

## Pre-Deployment Checklist

- [ ] Review all phase implementation documents
- [ ] Backup production database
- [ ] Test in staging environment
- [ ] Generate required secrets
- [ ] Update environment variables
- [ ] Review rollback procedures
- [ ] Schedule maintenance window (optional)

---

## Environment Variables

### Backend (.env)

```bash
# Existing variables
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
FRONTEND_URL=https://your-frontend.com

# Phase 1: Critical Fixes
API_KEY_SECRET=<64-char-hex>  # REQUIRED - generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
INGEST_IDEMPOTENCY_ENABLED=true
INGEST_IDEMPOTENCY_TTL_HOURS=24

# Phase 3: Operational Improvements
JWT_SECRETS=<secret1>,<secret2>  # Optional - for JWT rotation
JWT_SIGNING_SECRET=<secret2>     # Optional - for JWT rotation
DB_POOL_MAX=20
DB_POOL_MIN=5
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_CONNECTION_TIMEOUT=2000

# Phase 4: Enhancements
INGEST_RATE_LIMIT_PER_KEY=100
ADMIN_API_KEY_EXEMPT=true
```

### Agent (.env)

```bash
# Existing variables
BACKEND_INTERNAL_URL=http://backend:3000
ZEROCLAW_AGENT_NAME=zeroclaw-primary

# Phase 1: Critical Fixes
MAX_LOG_BUFFER_SIZE=10000
```

### Frontend (.env.local)

```bash
NEXT_PUBLIC_API_URL=https://your-api.com
NEXT_PUBLIC_WS_URL=https://your-api.com
```

---

## Deployment Steps

### 1. Generate Secrets

```bash
# API Key HMAC Secret (required)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# JWT Secrets (optional, for rotation)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Update Environment Variables

Add generated secrets to your deployment platform:

**Railway:**
```bash
railway variables set API_KEY_SECRET=<generated-secret>
```

**Kubernetes:**
```bash
kubectl create secret generic backend-secrets \
  --from-literal=API_KEY_SECRET=<generated-secret>
```

**Docker Compose:**
```yaml
services:
  backend:
    environment:
      - API_KEY_SECRET=${API_KEY_SECRET}
```

### 3. Database Migrations

Migrations run automatically on backend startup. To run manually:

```bash
cd backend
npm run migration:run
```

**Migrations included:**
- `1710172800000-AddCompositeIndexes.ts` - Phase 1
- `1710173000000-AddCostMaterializedViews.ts` - Phase 2
- `1710174000000-AddModelPricing.ts` - Phase 4

### 4. Build Docker Images

**Backend:**
```bash
cd backend
docker build -t claw-backend:latest .

# Verify multi-stage build reduced size
docker images claw-backend:latest
# Should be ~280MB (down from ~450MB)
```

**Agent:**
```bash
cd agent
docker build -t claw-agent:latest .

# Verify pinned ZeroClaw version
docker run --rm claw-agent:latest zeroclaw --version
# Should output: zeroclaw v0.4.2
```

**Frontend:**
```bash
cd frontend
docker build -t claw-frontend:latest .
```

### 5. Deploy Services

**Docker Compose:**
```bash
docker-compose up -d
```

**Kubernetes:**
```bash
kubectl apply -f k8s/
kubectl rollout status deployment/claw-backend
kubectl rollout status deployment/claw-agent
kubectl rollout status deployment/claw-frontend
```

**Railway:**
```bash
railway up
```

### 6. Verify Deployment

Run verification checks for each phase:

**Phase 1: Critical Fixes**
```bash
# Check composite indexes
psql $DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE tablename = 'agent_runs';"

# Test API key validation speed
time curl -H "X-Agent-Token: $API_KEY" http://localhost:3000/api/ingest/runs

# Test idempotency (send same request twice)
curl -X POST http://localhost:3000/api/ingest/costs \
  -H "X-Agent-Token: $API_KEY" \
  -d '{"runId":"test","provider":"test","model":"test","tokensIn":100,"tokensOut":50,"costUsd":"0.01"}'

# Check migration health
curl http://localhost:3000/api/health/ready
```

**Phase 2: Performance**
```bash
# Check materialized views
psql $DATABASE_URL -c "SELECT matviewname FROM pg_matviews;"

# Test cost analytics performance
time curl http://localhost:3000/api/costs/by-model?from=2026-01-01&to=2026-03-01

# Check Redis subscriptions (should be minimal)
redis-cli CLIENT LIST | grep -c "sub="
```

**Phase 3: Operations**
```bash
# Test graceful shutdown
docker kill --signal=SIGTERM <container-id>
# Check logs for "Graceful shutdown completed"

# Verify ZeroClaw version
docker run --rm claw-agent:latest zeroclaw --version

# Check Docker image sizes
docker images | grep claw
```

**Phase 4: Enhancements**
```bash
# Check model pricing
curl -H "Authorization: Bearer $ADMIN_JWT" \
  http://localhost:3000/api/admin/pricing

# Test rate limiting (send 101 requests)
for i in {1..101}; do
  curl -H "X-Agent-Token: $API_KEY" \
    -X POST http://localhost:3000/api/ingest/costs \
    -d '{"runId":"test-$i","provider":"test","model":"test","tokensIn":100,"tokensOut":50,"costUsd":"0.01"}'
done
# 101st should return HTTP 429

# Test WebSocket reconnection
# Open frontend, stop backend, observe reconnection indicator

# Run bundle analysis
cd frontend && npm run build:analyze
```

---

## Post-Deployment Monitoring

### Key Metrics to Watch

**Database Performance:**
```sql
-- Query latency
SELECT 
  query,
  mean_exec_time,
  calls
FROM pg_stat_statements
WHERE query LIKE '%agent_runs%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Connection pool utilization
SELECT 
  count(*) as total,
  count(*) FILTER (WHERE state = 'idle') as idle,
  count(*) FILTER (WHERE state = 'active') as active
FROM pg_stat_activity
WHERE datname = current_database();

-- Materialized view freshness
SELECT 
  matviewname,
  last_refresh,
  NOW() - last_refresh as age
FROM pg_stat_user_tables
WHERE relname LIKE '%cost_summary';
```

**API Performance:**
```bash
# API key validation latency
curl -w "@curl-format.txt" -H "X-Agent-Token: $API_KEY" \
  http://localhost:3000/api/ingest/runs

# Rate limit headers
curl -v -H "X-Agent-Token: $API_KEY" \
  http://localhost:3000/api/ingest/costs
# Check X-RateLimit-* headers
```

**Redis Performance:**
```bash
# Subscription count
redis-cli CLIENT LIST | grep -c "sub="

# Rate limit keys
redis-cli KEYS "rate_limit:api_key:*" | wc -l

# Memory usage
redis-cli INFO memory | grep used_memory_human
```

**Application Metrics:**
```bash
# Backend logs (structured JSON)
docker logs <backend-container> | jq .

# Agent memory usage
docker stats <agent-container>

# Frontend bundle size
du -sh frontend/.next/static/chunks/*.js
```

### Alerts to Configure

1. **Database:**
   - Query latency > 500ms
   - Connection pool > 90% utilized
   - Materialized view age > 1 hour

2. **API:**
   - API key validation > 10ms
   - Rate limit hits > 100/hour
   - HTTP 429 responses > 50/hour

3. **Redis:**
   - Memory usage > 80%
   - Subscription count > 1000
   - Connection errors

4. **Application:**
   - Agent memory > 200MB
   - Backend graceful shutdown timeout
   - Frontend client errors > 10/hour

---

## Rollback Procedures

### Complete Rollback (All Phases)

```bash
# 1. Revert to previous Docker images
docker tag claw-backend:previous claw-backend:latest
docker tag claw-agent:previous claw-agent:latest
docker tag claw-frontend:previous claw-frontend:latest

# 2. Redeploy
docker-compose up -d

# 3. Revert database migrations (if needed)
cd backend
npm run migration:revert
```

### Selective Rollback (By Phase)

**Phase 1:**
```bash
# Remove API_KEY_SECRET (service will fail to start - intentional)
# Revert idempotency: INGEST_IDEMPOTENCY_ENABLED=false
# Drop indexes: DROP INDEX idx_agent_runs_name_status_started;
```

**Phase 2:**
```bash
# Drop materialized views
psql $DATABASE_URL -c "DROP MATERIALIZED VIEW hourly_cost_summary;"
psql $DATABASE_URL -c "DROP MATERIALIZED VIEW daily_cost_summary;"

# Revert agents.service.ts to use findAndCount()
```

**Phase 3:**
```bash
# Revert Dockerfile to single-stage
# Remove graceful shutdown handlers
# Revert to single JWT_SECRET
```

**Phase 4:**
```bash
# Revert costs.service.ts to use hardcoded PRICING_MAP
# Remove ApiKeyRateLimitGuard from controllers
# Revert useWebSocket.ts reconnection settings
```

---

## Troubleshooting

### Backend Won't Start

**Symptom:** Backend exits immediately

**Possible Causes:**
1. Missing `API_KEY_SECRET`
2. Database connection failed
3. Migration failed

**Solution:**
```bash
# Check logs
docker logs <backend-container>

# Verify environment variables
docker exec <backend-container> env | grep API_KEY_SECRET

# Test database connection
psql $DATABASE_URL -c "SELECT 1;"

# Run migrations manually
docker exec <backend-container> npm run migration:run
```

### High Database CPU

**Symptom:** Database CPU > 80%

**Possible Causes:**
1. Missing composite indexes
2. Materialized views not refreshing
3. Connection pool exhausted

**Solution:**
```sql
-- Check for missing indexes
SELECT * FROM pg_stat_user_tables WHERE idx_scan = 0;

-- Check materialized view age
SELECT matviewname, last_refresh FROM pg_stat_user_tables 
WHERE relname LIKE '%cost_summary';

-- Check connection pool
SELECT count(*) FROM pg_stat_activity;
```

### Rate Limiting Too Aggressive

**Symptom:** Legitimate requests getting HTTP 429

**Solution:**
```bash
# Increase rate limit
export INGEST_RATE_LIMIT_PER_KEY=200

# Or exempt specific keys
# Set key type to 'admin' in database
```

### WebSocket Not Reconnecting

**Symptom:** Frontend shows "Connection Failed" immediately

**Solution:**
```typescript
// Check useWebSocket.ts configuration
// Verify reconnectionAttempts: 10
// Check backend WebSocket endpoint is accessible
```

### Bundle Size Too Large

**Symptom:** Frontend loads slowly

**Solution:**
```bash
# Run bundle analysis
cd frontend && npm run build:analyze

# Check for large dependencies
# Implement code splitting
# Use dynamic imports
```

---

## Performance Benchmarks

Run these benchmarks to verify improvements:

```bash
# Database query performance
time psql $DATABASE_URL -c "
  SELECT * FROM agent_runs 
  WHERE agent_name = 'test' AND status = 'completed' 
  ORDER BY started_at DESC LIMIT 50;
"
# Target: < 100ms

# API key validation
time curl -H "X-Agent-Token: $API_KEY" http://localhost:3000/api/ingest/runs
# Target: < 50ms total, < 5ms validation

# Cost analytics
time curl "http://localhost:3000/api/costs/by-model?from=2026-01-01&to=2026-03-01"
# Target: < 500ms

# WebSocket reconnection
# Stop backend, measure time to reconnect
# Target: < 10 seconds

# Frontend bundle size
du -sh frontend/.next/static/chunks/main-*.js
# Target: < 200KB gzipped
```

---

## Success Criteria

✅ All migrations completed successfully  
✅ No errors in backend logs  
✅ API key validation < 5ms  
✅ Query latency reduced by 70%  
✅ Zero duplicate cost records  
✅ Agent memory stable < 200MB  
✅ Graceful shutdown < 30s  
✅ Docker images 30-50% smaller  
✅ Rate limiting working (HTTP 429 after limit)  
✅ WebSocket reconnects after outage  
✅ Error boundaries catch frontend errors  
✅ Bundle analysis reports generated  

---

## Support & Documentation

- **Phase 1 Details:** `PHASE1_IMPLEMENTATION.md`
- **Phase 2 Details:** `PHASE2_IMPLEMENTATION.md`
- **Phase 3 Details:** `PHASE3_IMPLEMENTATION.md`
- **Phase 4 Details:** `PHASE4_IMPLEMENTATION.md`
- **Implementation Summary:** `IMPLEMENTATION_SUMMARY.md`
- **Infrastructure Audit:** `INFRASTRUCTURE_AUDIT.md`
- **Requirements:** `.kiro/specs/infrastructure-optimization/requirements.md`

---

## Next Steps

After successful deployment:

1. Monitor metrics for 24-48 hours
2. Verify no performance regressions
3. Document any issues encountered
4. Consider implementing deferred items:
   - Phase 1.5: Table Partitioning
   - Phase 2.5: Metrics Downsampling

---

**Deployment Status:** ✅ Ready for Production

All 20 implemented optimizations are production-ready, backward compatible, and include comprehensive rollback procedures.

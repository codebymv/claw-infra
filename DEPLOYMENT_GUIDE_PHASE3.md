# Phase 3 Deployment Guide

Quick reference guide for deploying Phase 3 operational improvements.

## Pre-Deployment Checklist

- [ ] Review `PHASE3_IMPLEMENTATION.md` for detailed changes
- [ ] Generate JWT secrets if rotating: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] Review connection pool settings for your environment
- [ ] Backup current deployment configuration
- [ ] Test in staging environment first

## Environment Variables

Add these to your backend `.env`:

```bash
# JWT Secret Rotation (optional - only if rotating secrets)
# JWT_SECRETS=old_secret,new_secret
# JWT_SIGNING_SECRET=new_secret

# Connection Pool Tuning (optional - defaults shown)
DB_POOL_MAX=20
DB_POOL_MIN=5
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_CONNECTION_TIMEOUT=2000
```

## Docker Build

### Backend

```bash
cd backend
docker build -t claw-backend:phase3 .

# Verify multi-stage build reduced size
docker images claw-backend:phase3
# Should be ~280MB (down from ~450MB)
```

### Agent

```bash
cd agent
docker build -t claw-agent:phase3 .

# Verify pinned version
docker run --rm claw-agent:phase3 zeroclaw --version
# Should output: zeroclaw v0.4.2
```

## Kubernetes Deployment

Update your deployment YAML:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claw-backend
spec:
  template:
    spec:
      # IMPORTANT: Set termination grace period for graceful shutdown
      terminationGracePeriodSeconds: 35
      
      containers:
      - name: backend
        image: claw-backend:phase3
        
        # Add environment variables
        env:
        - name: DB_POOL_MAX
          value: "20"
        - name: DB_POOL_MIN
          value: "5"
        
        # Optional: Add preStop hook for load balancer deregistration
        lifecycle:
          preStop:
            exec:
              command: ["/bin/sh", "-c", "sleep 5"]
```

## Docker Compose Deployment

Update your `docker-compose.yml`:

```yaml
services:
  backend:
    image: claw-backend:phase3
    stop_grace_period: 35s
    environment:
      - DB_POOL_MAX=20
      - DB_POOL_MIN=5
      - DB_POOL_IDLE_TIMEOUT=30000
      - DB_POOL_CONNECTION_TIMEOUT=2000
  
  agent:
    image: claw-agent:phase3
```

## Verification Steps

### 1. Graceful Shutdown

```bash
# Start a long-running request
curl http://localhost:3000/api/agents/runs?limit=100 &

# Send SIGTERM
docker kill --signal=SIGTERM <container-id>

# Check logs - should see:
# "Received SIGTERM, starting graceful shutdown..."
# "Graceful shutdown completed"

# Request should complete successfully
```

### 2. JWT Rotation (if configured)

```bash
# Get old token (before rotation)
OLD_TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}' \
  | jq -r '.access_token')

# Update JWT_SECRETS and JWT_SIGNING_SECRET
# Restart backend

# Get new token (after rotation)
NEW_TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}' \
  | jq -r '.access_token')

# Both tokens should work
curl -H "Authorization: Bearer $OLD_TOKEN" http://localhost:3000/api/agents/runs
curl -H "Authorization: Bearer $NEW_TOKEN" http://localhost:3000/api/agents/runs
```

### 3. Connection Pool

```bash
# Monitor database connections
psql $DATABASE_URL -c "
  SELECT 
    count(*) as total,
    count(*) FILTER (WHERE state = 'idle') as idle,
    count(*) FILTER (WHERE state = 'active') as active
  FROM pg_stat_activity 
  WHERE datname = current_database();
"

# Should see connections between DB_POOL_MIN and DB_POOL_MAX
```

### 4. Structured Logging

```bash
# Check logs are JSON formatted
docker logs <container-id> | head -1 | jq .

# Should output structured log entry:
# {
#   "timestamp": "2026-03-11T10:30:45.123Z",
#   "level": "info",
#   "event": "...",
#   "message": "..."
# }
```

### 5. Docker Image Size

```bash
docker images | grep claw-backend
# Should see ~280MB (38% smaller than before)

docker images | grep claw-agent
# Should see similar or smaller size
```

### 6. ZeroClaw Version

```bash
docker run --rm claw-agent:phase3 zeroclaw --version
# Should output: zeroclaw v0.4.2 (pinned version)
```

## Monitoring

### Key Metrics to Watch

1. **Graceful Shutdown:**
   - Monitor for dropped requests during deployments
   - Check shutdown duration (should be <30s)

2. **Connection Pool:**
   - Active connections
   - Idle connections
   - Connection wait time
   - Pool exhaustion errors

3. **JWT Validation:**
   - Token validation success rate
   - Token validation latency

4. **Docker Images:**
   - Image pull time
   - Storage usage

### Monitoring Queries

```sql
-- Connection pool utilization
SELECT 
  count(*) as total_connections,
  count(*) FILTER (WHERE state = 'idle') as idle,
  count(*) FILTER (WHERE state = 'active') as active,
  max(backend_start) as oldest_connection
FROM pg_stat_activity
WHERE datname = current_database();

-- Check for connection pool exhaustion
SELECT 
  wait_event_type,
  wait_event,
  count(*)
FROM pg_stat_activity
WHERE wait_event_type = 'Client'
  AND wait_event = 'ClientRead'
GROUP BY wait_event_type, wait_event;
```

## Rollback Procedures

### Rollback Docker Images

```bash
# Tag previous version as latest
docker tag claw-backend:phase2 claw-backend:latest
docker tag claw-agent:phase2 claw-agent:latest

# Redeploy
kubectl rollout restart deployment/claw-backend
kubectl rollout restart deployment/claw-agent
```

### Rollback Environment Variables

```bash
# Remove Phase 3 variables
unset JWT_SECRETS JWT_SIGNING_SECRET
unset DB_POOL_MAX DB_POOL_MIN DB_POOL_IDLE_TIMEOUT DB_POOL_CONNECTION_TIMEOUT

# Restart services
kubectl rollout restart deployment/claw-backend
```

### Rollback ZeroClaw Version

```bash
# Build with previous version
docker build --build-arg ZEROCLAW_VERSION=v0.4.1 -t claw-agent:rollback agent/

# Deploy rollback
docker tag claw-agent:rollback claw-agent:latest
kubectl rollout restart deployment/claw-agent
```

## Troubleshooting

### Graceful Shutdown Timeout

**Symptom:** Backend exits with code 1, logs show "Graceful shutdown timeout exceeded"

**Solution:**
- Increase `terminationGracePeriodSeconds` in Kubernetes
- Increase timeout in `main.ts` (currently 30s)
- Check for long-running queries blocking shutdown

### Connection Pool Exhausted

**Symptom:** HTTP 503 errors, logs show "Connection pool exhausted"

**Solution:**
- Increase `DB_POOL_MAX`
- Check for connection leaks (connections not being released)
- Monitor slow queries that hold connections

### JWT Validation Failures

**Symptom:** HTTP 401 errors after JWT rotation

**Solution:**
- Verify `JWT_SIGNING_SECRET` is in `JWT_SECRETS` list
- Check for typos in comma-separated secrets
- Ensure no extra whitespace in environment variables

### Docker Build Fails

**Symptom:** "ZEROCLAW_VERSION=latest is not allowed"

**Solution:**
- Pin to specific version in Dockerfile
- Or override at build time: `--build-arg ZEROCLAW_VERSION=v0.4.2`

## Performance Benchmarks

Run these after deployment to verify improvements:

```bash
# 1. Graceful shutdown (should complete request)
time (curl http://localhost:3000/api/agents/runs & docker kill --signal=SIGTERM <container-id>)

# 2. Connection pool (should be fast)
time curl http://localhost:3000/api/agents/runs

# 3. Docker image size
docker images | grep claw-backend
# Should be ~280MB (38% smaller)

# 4. Structured logs (should be JSON)
docker logs <container-id> | jq .
```

## Next Steps

After Phase 3 is stable:

1. Monitor metrics for 24-48 hours
2. Verify no regressions in performance or reliability
3. Consider implementing Phase 4 enhancements:
   - Move model pricing to database
   - Add per-agent-key rate limiting
   - Add WebSocket reconnection backoff
   - Frontend bundle analysis
   - Error boundaries in frontend

## Support

For issues or questions:
- Review `PHASE3_IMPLEMENTATION.md` for detailed implementation
- Check `IMPLEMENTATION_SUMMARY.md` for overall project status
- Review `INFRASTRUCTURE_AUDIT.md` for original findings

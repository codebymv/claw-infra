# Deployment Fix Required

## Issue
Backend is failing to start with error: "API_KEY_SECRET environment variable is required"

## Root Cause
The `API_KEY_SECRET` environment variable is not set in the Railway deployment environment.

## Solution
Set the following environment variable in Railway dashboard:

### Required Environment Variable
```bash
API_KEY_SECRET=<generate-64-char-hex-string>
```

### How to Generate the Secret
Run this command to generate a secure 64-character hex string:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Where to Set It
1. Go to Railway dashboard
2. Select the backend service
3. Go to Variables tab
4. Add new variable:
   - Name: `API_KEY_SECRET`
   - Value: (the generated hex string)
5. Deploy/restart the service

## Additional Optional Variables
For full Phase 1-4 functionality, also consider setting:

```bash
# Phase 1: Idempotency
INGEST_IDEMPOTENCY_ENABLED=true
INGEST_IDEMPOTENCY_TTL_HOURS=24

# Phase 3: JWT Rotation (optional)
JWT_SECRETS=secret1,secret2
JWT_SIGNING_SECRET=secret2

# Phase 3: Database Pool Tuning
DB_POOL_MAX=20
DB_POOL_MIN=5
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_CONNECTION_TIMEOUT=2000

# Phase 4: Rate Limiting
INGEST_RATE_LIMIT_PER_KEY=100
ADMIN_API_KEY_EXEMPT=true
```

## Status
- ❌ Backend failing to start
- ⏳ Waiting for environment variable configuration
- ✅ All code changes deployed successfully

## Next Steps
1. Set `API_KEY_SECRET` environment variable in Railway
2. Restart backend service
3. Verify successful startup
4. Test API functionality

The backend will start successfully once this environment variable is configured.
# Fix Missing Materialized Views - Updated

## Issue
Cost analytics endpoints are failing with error: `relation "daily_cost_summary" does not exist`

## Solution Options

### Option 1: Use the HTTP Endpoint (Easiest)

I've created an admin endpoint to fix this. You'll need to:

1. **Get an admin JWT token** by logging into the frontend
2. **Call the fix endpoint** using curl or Postman

```bash
# Replace YOUR_JWT_TOKEN with the actual token from login
curl -X POST https://backend-production-c094.up.railway.app/api/admin/fix/materialized-views \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

### Option 2: Fix the Database Connection Issue

The script failed because of a PostgreSQL authentication issue. Try this:

1. **Check if dotenv is installed:**
```bash
cd claw-infra/backend
npm install dotenv
```

2. **Run the script again:**
```bash
node fix-materialized-views.js
```

### Option 3: Manual Database Connection

If you have direct database access, connect to PostgreSQL and run:

```sql
-- Connect to your database
psql "postgresql://postgres:MLRkCidWCwqcZWSPTWEbEgChLVzXTvFR@shuttle.proxy.rlwy.net:35673/railway"

-- Then run these commands:
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_cost_summary AS
SELECT 
  DATE_TRUNC('day', recorded_at) as day,
  provider,
  model,
  SUM(CAST(cost_usd AS DECIMAL)) as total_cost_usd,
  SUM(tokens_in) as total_tokens_in,
  SUM(tokens_out) as total_tokens_out,
  COUNT(*) as call_count
FROM cost_records
WHERE recorded_at < DATE_TRUNC('day', NOW())
GROUP BY DATE_TRUNC('day', recorded_at), provider, model;

CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_cost_summary AS
SELECT 
  DATE_TRUNC('hour', recorded_at) as hour,
  provider,
  model,
  SUM(CAST(cost_usd AS DECIMAL)) as total_cost_usd,
  SUM(tokens_in) as total_tokens_in,
  SUM(tokens_out) as total_tokens_out,
  COUNT(*) as call_count
FROM cost_records
WHERE recorded_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', recorded_at), provider, model;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_daily_cost_summary_day_provider_model 
ON daily_cost_summary (day, provider, model);

CREATE INDEX IF NOT EXISTS idx_daily_cost_summary_day 
ON daily_cost_summary (day);

CREATE INDEX IF NOT EXISTS idx_hourly_cost_summary_hour_provider_model 
ON hourly_cost_summary (hour, provider, model);

CREATE INDEX IF NOT EXISTS idx_hourly_cost_summary_hour 
ON hourly_cost_summary (hour);

-- Refresh views
REFRESH MATERIALIZED VIEW daily_cost_summary;
REFRESH MATERIALIZED VIEW hourly_cost_summary;
```

## How to Get JWT Token

1. Open the frontend application
2. Login with your credentials
3. Open browser developer tools (F12)
4. Go to Application/Storage tab
5. Look for `access_token` in localStorage
6. Copy the token value

## Verification

After running any of these fixes, test:
- `GET /api/costs/by-model?period=7d` - should return 200 OK
- `GET /api/costs/summary?period=7d` - should work without errors

## Recommended Approach

**Option 1 (HTTP endpoint)** is the easiest since it uses the existing database connection from the running application.
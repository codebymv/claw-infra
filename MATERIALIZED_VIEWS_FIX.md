# Materialized Views Fix - 500 Error Resolution

## Issue Summary

The application was experiencing repeated errors in the logs due to missing materialized views:

```
Failed to refresh hourly_cost_summary: relation "hourly_cost_summary" does not exist
Failed to refresh daily_cost_summary: relation "daily_cost_summary" does not exist
```

These errors were occurring every 5 minutes (hourly refresh) and every hour (daily refresh), causing log spam and potential 500 errors when users accessed cost-related endpoints.

## Root Cause

The materialized views `hourly_cost_summary` and `daily_cost_summary` were not created in the production database, despite the migration file existing. This could happen due to:

1. Migration file not being included in deployment
2. Migration failing silently during deployment
3. Views being dropped accidentally
4. Database connection issues during migration

## Solution Implemented

### 1. Enhanced CostRefreshService

Updated `claw-infra/backend/src/costs/cost-refresh.service.ts` to:

- **Auto-detect missing views**: Check if materialized views exist before attempting to refresh
- **Auto-create missing views**: Create views with proper indexes if they don't exist
- **Graceful error handling**: Reset creation flag if views are dropped later
- **Detailed logging**: Log when views are created or verified

### 2. Enhanced CostsService

Updated `claw-infra/backend/src/costs/costs.service.ts` to:

- **Fallback queries**: Use direct `cost_records` table queries if materialized views fail
- **Error handling**: Catch materialized view errors and fall back gracefully
- **Performance preservation**: Still use materialized views when available for better performance

### 3. Database Manager Utility

Created a comprehensive database management utility at `claw-infra/backend/database-manager.ts`:

- **Multiple Operations**: Fix materialized views, health checks, cleanup, index rebuilds, migrations
- **Dry Run Mode**: Preview changes without executing them
- **Production Ready**: Safe error handling, logging, and connection management
- **Easy to Use**: Simple npm scripts for common operations

## Deployment Instructions

### Immediate Fix (Production)

**Option A: Use the Database Manager (Recommended)**
```bash
cd claw-infra/backend
npm run db:fix
```

**Option B: Preview changes first**
```bash
cd claw-infra/backend
npm run db:fix -- --dry-run  # Preview what will be fixed
npm run db:fix               # Apply the fix
```

**Option C: Run SQL script directly**
```bash
psql $DATABASE_URL -f claw-infra/backend/fix-materialized-views.sql
```

### Verification

After applying the fix:

```bash
# Check database health
npm run db:health

# Verify materialized views exist
npm run db:manage -- --operation=health
```

### Long-term Solution

The enhanced services provide automatic recovery, so this issue won't recur even if views are accidentally dropped in the future.

## Database Manager Usage

The new database manager provides several useful operations:

```bash
# Fix materialized views (most common)
npm run db:fix

# Database health check
npm run db:health

# Database cleanup and optimization
npm run db:cleanup

# Rebuild indexes
npm run db:indexes

# Run pending migrations
npm run db:migrate

# Preview any operation without changes
npm run db:manage -- --operation=<name> --dry-run
```

See `DATABASE_MANAGER.md` for complete documentation.

## Files Modified

- `claw-infra/backend/src/costs/cost-refresh.service.ts` - Auto-creation and error handling
- `claw-infra/backend/src/costs/costs.service.ts` - Fallback queries and error handling
- `claw-infra/backend/database-manager.ts` - Comprehensive database management utility
- `claw-infra/backend/package.json` - Added database management scripts
- `claw-infra/backend/fix-materialized-views.sql` - Emergency SQL fix
- `claw-infra/backend/DATABASE_MANAGER.md` - Complete documentation

## Benefits

1. **Immediate resolution**: Stops the 500 errors and log spam
2. **Self-healing**: Automatically recovers from future view issues
3. **Comprehensive tooling**: Database manager for ongoing maintenance
4. **Backward compatible**: Falls back to direct queries if needed
5. **Performance maintained**: Still uses materialized views when available
6. **Zero downtime**: Can be deployed without service interruption
7. **Production ready**: Safe for automated deployment and maintenance

The application should now be fully functional with proper error handling, automatic recovery, and comprehensive database management capabilities.
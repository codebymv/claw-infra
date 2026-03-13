# Database Manager

A comprehensive TypeScript utility for managing database operations, fixes, and maintenance tasks.

## Features

- **Materialized Views Management**: Create, refresh, and verify materialized views
- **Index Management**: Rebuild and optimize database indexes
- **Health Checks**: Comprehensive database health and performance monitoring
- **Database Cleanup**: Vacuum, analyze, and optimize database performance
- **Migration Management**: Run pending migrations safely
- **Dry Run Mode**: Preview changes without executing them
- **Graceful Error Handling**: Robust error handling with detailed logging
- **Production Ready**: Safe for production use with proper connection management

## Quick Start

### Fix Materialized Views (Most Common Use Case)
```bash
# Fix missing materialized views immediately
npm run db:fix

# Preview what would be fixed (dry run)
npm run db:fix -- --dry-run
```

### Other Operations
```bash
# Database health check
npm run db:health

# Clean up and optimize database
npm run db:cleanup

# Rebuild indexes for better performance
npm run db:indexes

# Run pending migrations
npm run db:migrate
```

## Available Operations

| Operation | Description | Usage |
|-----------|-------------|-------|
| `matviews` | Fix missing materialized views | `npm run db:fix` |
| `health` | Comprehensive health check | `npm run db:health` |
| `cleanup` | Database cleanup and optimization | `npm run db:cleanup` |
| `indexes` | Rebuild database indexes | `npm run db:indexes` |
| `migrate` | Run pending migrations | `npm run db:migrate` |

## Advanced Usage

### Manual Operation Selection
```bash
# Run specific operation
npm run db:manage -- --operation=health

# Run with dry-run mode
npm run db:manage -- --operation=cleanup --dry-run

# Run with verbose output
npm run db:manage -- --operation=matviews --verbose

# Force operation (skip confirmations)
npm run db:manage -- --operation=indexes --force
```

### Command Line Options

| Option | Description | Example |
|--------|-------------|---------|
| `--operation=<name>` | Specify operation to run | `--operation=matviews` |
| `--dry-run` | Preview changes without executing | `--dry-run` |
| `--verbose` | Enable detailed logging | `--verbose` |
| `--force` | Skip confirmations | `--force` |
| `--help` | Show help information | `--help` |

## Environment Variables

The script uses the same database configuration as the main application:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_NAME=claw_infra
DB_SSL=false
```

## Operation Details

### Materialized Views (`matviews`)

**Purpose**: Creates missing materialized views for cost summaries that improve query performance.

**What it does**:
- Checks if `hourly_cost_summary` and `daily_cost_summary` views exist
- Creates missing views with proper indexes
- Refreshes existing views with latest data
- Verifies views are working correctly

**When to use**:
- After deployment if cost queries are failing
- When logs show "relation does not exist" errors
- As part of database maintenance

**Example output**:
```
🔍 Checking materialized views status...
   Hourly materialized view exists: ❌
   Daily materialized view exists: ❌
🔨 Creating missing materialized views...
   Creating hourly_cost_summary...
   ✅ hourly_cost_summary created
   Creating daily_cost_summary...
   ✅ daily_cost_summary created
🧪 Testing materialized views...
   Hourly summary records: 1,234
   Daily summary records: 567
✅ Operation completed successfully
```

### Health Check (`health`)

**Purpose**: Comprehensive database health and performance analysis.

**What it checks**:
- PostgreSQL version and connection info
- Database size and table sizes
- Materialized view status
- Active connections
- Slow queries (if pg_stat_statements is available)

**When to use**:
- Regular health monitoring
- Performance troubleshooting
- Before major operations
- After deployment verification

### Database Cleanup (`cleanup`)

**Purpose**: Optimize database performance through maintenance operations.

**What it does**:
- Runs `VACUUM ANALYZE` on all tables
- Updates table statistics
- Reclaims disk space
- Optimizes query planner statistics

**When to use**:
- Regular maintenance (weekly/monthly)
- After large data operations
- When query performance degrades
- As part of deployment maintenance

### Index Rebuild (`indexes`)

**Purpose**: Rebuild database indexes for optimal performance.

**What it does**:
- Lists all database indexes
- Rebuilds indexes concurrently (non-blocking)
- Skips primary key indexes (cannot be rebuilt)
- Reports any rebuild failures

**When to use**:
- After major schema changes
- When index corruption is suspected
- Performance optimization
- Database maintenance

### Migration Management (`migrate`)

**Purpose**: Safely run pending database migrations.

**What it does**:
- Checks for pending migrations
- Runs migrations in a transaction
- Reports applied migrations
- Handles migration failures gracefully

**When to use**:
- After code deployment
- When migration errors occur
- Manual migration execution
- Database schema updates

## Safety Features

### Dry Run Mode
All operations support `--dry-run` mode that shows what would be done without making changes:

```bash
npm run db:manage -- --operation=cleanup --dry-run
```

### Connection Management
- Automatic connection cleanup
- Graceful shutdown handling
- Connection verification before operations
- Proper error handling and logging

### Transaction Safety
- Operations use transactions where appropriate
- Rollback on failure for critical operations
- Non-blocking concurrent operations where possible

## Troubleshooting

### Common Issues

**Connection Errors**:
```bash
❌ Failed to connect to database: connection refused
```
- Check database is running
- Verify connection parameters
- Check network connectivity

**Permission Errors**:
```bash
❌ Operation failed: permission denied
```
- Ensure database user has required permissions
- Check if user can create materialized views
- Verify schema access permissions

**Missing Extensions**:
```bash
⚠️ pg_stat_statements extension not available
```
- Some features require PostgreSQL extensions
- Install extensions if needed for full functionality

### Getting Help

```bash
# Show all available operations
npm run db:manage -- --help

# Run with verbose output for debugging
npm run db:manage -- --operation=health --verbose
```

## Production Usage

### Pre-deployment Check
```bash
# Verify database health before deployment
npm run db:health

# Check what would be fixed
npm run db:fix -- --dry-run
```

### Post-deployment Maintenance
```bash
# Fix any issues after deployment
npm run db:fix

# Run cleanup and optimization
npm run db:cleanup

# Verify everything is working
npm run db:health
```

### Regular Maintenance
```bash
# Weekly maintenance script
npm run db:cleanup
npm run db:health

# Monthly optimization
npm run db:indexes
npm run db:cleanup
```

## Integration with CI/CD

Add to your deployment pipeline:

```yaml
# Example GitHub Actions step
- name: Database Maintenance
  run: |
    cd claw-infra/backend
    npm run db:fix
    npm run db:health
```

The database manager is designed to be safe for automated execution and will handle errors gracefully without breaking your deployment pipeline.
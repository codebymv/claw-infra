# ClawInfra Implementation Plan: Code Visibility + Platform Hardening

## Context gathered from current `main` (527a482)

This plan is based on a fresh review of the current codebase:

- **Frontend routes today:** `/`, `/agents`, `/agents/[runId]`, `/costs`, `/resources`, `/settings`
- **No `/code` route exists yet**
- **Realtime gateway exists** (`backend/src/ws/app.gateway.ts`) with publish methods, but no service-level broadcast wiring found
- **Alert service exists** (`backend/src/alerts/alerts.service.ts`) but only clearly wired usage is blocked-IP guard
- **Ingest endpoints** exist for runs/steps/costs/logs/metrics, but no idempotency keys yet
- **JWT secret fallback** (`changeme-in-production`) is still present in multiple auth/ws files
- **No migration setup visible** (TypeORM `synchronize` still used outside production)
- **Retention jobs** are not present for logs/metrics/cost growth

---

## Goals

1. Add a **new Code Visibility product surface** (`/code`) for PR throughput, LoC, review flow, and cycle time
2. Close core production gaps discovered during review (realtime, alerting, idempotency, lifecycle guards, health, retention, migrations, auth hardening)
3. Deliver in staged PRs with clear acceptance criteria and rollback safety

---

## Product Scope: `/code` tab

### MVP Questions we must answer

- How many PRs were opened/merged over selected period?
- How many lines were added/deleted/net by repo/author/agent?
- How long do PRs take to first review and to merge?
- What is merged PR success/quality proxy (reverts/hotfix follow-ups)?

### UX (frontend)

Add `frontend/app/code/page.tsx` with:

1. **Top KPI cards**
   - PRs opened, PRs merged, commits, files changed, LoC add/del/net
2. **Trend charts** (7/30/90 days)
   - PR volume, LoC volume, merge latency, first-review latency
3. **PR table**
   - Title, repo, author, size, state, reviews, cycle time, merge status
4. **Filters**
   - repo, date range, author, agent tag
5. **Quality panel**
   - revert count/rate, hotfix-follow-up rate, CI pass rate (if available)

### Data ingestion and sync

Preferred approach: **hybrid webhook + reconciliation sync**

- Webhooks for near-real-time updates
- Scheduled backfill job (every 6h + nightly full day reconciliation)
- Manual backfill endpoint for historical import and recovery

Provider target: GitHub first (GitLab pluggable later)

---

## Backend design for Code Visibility

### New module

`backend/src/code/*`

- `code.controller.ts`
- `code.service.ts`
- `code.provider.github.ts`
- `code.sync.service.ts`
- `code.webhook.controller.ts`
- DTOs for filters + webhook payload subsets

### Proposed entities (new)

1. `code_repos`
   - `id`, `provider`, `owner`, `name`, `is_active`, `default_branch`, timestamps
2. `code_prs`
   - external PR id, repo id, number, title, author, state, draft, labels, additions, deletions, changed_files,
   - opened_at, first_review_at, merged_at, closed_at, merged_by
3. `code_pr_reviews`
   - review id, pr id, reviewer, state, submitted_at
4. `code_commits`
   - sha, repo id, pr id nullable, author, committed_at, additions, deletions, files_changed
5. `code_sync_state`
   - provider cursor/high-watermark per repo/event stream
6. `code_daily_metrics`
   - pre-aggregated daily rollups for fast charts

### API contracts (dashboard)

- `GET /api/code/overview?from=&to=&repo=&author=`
- `GET /api/code/trends?from=&to=&bucket=day&repo=`
- `GET /api/code/prs?from=&to=&repo=&author=&state=&page=&limit=`
- `GET /api/code/quality?from=&to=&repo=`
- `POST /api/code/sync/backfill` (admin-only)
- `POST /api/code/webhooks/github` (signature verified)

### Security

- HMAC signature validation for webhook endpoint
- Separate provider token with least privilege (read-only repo/PR metadata)
- Secrets managed by env + runtime startup validation

---

## Platform hardening scope (non-UI)

### 1) Realtime wiring

Wire service mutations to websocket gateway:

- Run lifecycle events (`create/start/update/cancel`) -> `broadcastRunUpdate`
- Log ingest -> `broadcastLog`
- Metrics ingest -> `broadcastResourceUpdate`

### 2) Alert automation wiring

Add triggers:

- run status transitions to `failed` -> `alerts.runFailed`
- budget threshold crossed -> `alerts.budgetExceeded` (with cooldown to prevent spam)
- auth failure threshold -> `alerts.authFailure`
- health dependency failures -> `alerts.healthDegraded`

### 3) Idempotency for ingest

Add support for `Idempotency-Key` header on ingest endpoints:

- Hash key + route + token prefix
- Persist response envelope for replay within TTL (e.g., 24h)
- Return same result on retries (especially costs/logs/steps)

### 4) Run/step lifecycle guards

- Enforce legal transitions (queued -> running -> terminal)
- Reject invalid updates to terminal runs/steps
- Ensure `completedAt` + durations are consistent

### 5) Auth hardening

- Fail startup in production when `JWT_SECRET` missing/weak
- Remove `changeme-in-production` fallback in auth/ws strategy paths

### 6) Health checks

Enhance `/api/health` to include dependency checks:

- postgres connectivity
- redis connectivity (for pub/sub)
- optional queue lag / ingest liveness

Return structured status:

```json
{
  "status": "ok|degraded|down",
  "checks": {
    "db": "ok",
    "redis": "ok"
  },
  "timestamp": "..."
}
```

### 7) Data retention jobs

- logs retention (e.g., 30-90d by config)
- high-frequency metrics downsampling + TTL
- cost record retention policy (longer, e.g., 12-18mo) or archival

### 8) Migrations and schema discipline

- Add TypeORM migration generation/run scripts
- Establish migration-only changes for production
- Add migration docs + CI check for drift

### 9) Test coverage

Add tests for:

- ingest idempotency replay behavior
- lifecycle transition enforcement
- websocket event emission on writes
- code metrics aggregation correctness
- webhook signature validation

---

## Delivery plan (PR slices)

## Phase 0 — Foundations (PR #1)

- Add migration infrastructure
- Add startup env validation (JWT secret policy)
- Add deep health endpoint
- Add baseline test harness improvements

**Acceptance:** app boots cleanly with validations; health exposes db/redis checks.

## Phase 1 — Data model + sync backend (PR #2)

- Add `code_*` entities + migrations
- Add GitHub provider client and backfill sync service
- Add `GET /api/code/overview`, `trends`, `prs`

**Acceptance:** historical backfill populates `/api/code/*` for one repo.

## Phase 2 — `/code` UI (PR #3)

- Add sidebar nav item + route
- KPI cards, trends, PR table, filters
- Empty/loading/error states

**Acceptance:** dashboard renders real data end-to-end from Phase 1 APIs.

## Phase 3 — Webhooks realtime + reconciliation (PR #4)

- GitHub webhook endpoint with signature validation
- Sync cursor handling + replay-safe updates
- Scheduled reconciliation job

**Acceptance:** PR updates appear within seconds, no duplicate rows on retries.

## Phase 4 — Infra hardening (PR #5)

- Wire websocket broadcasts from services
- Wire alerts for failed runs + budget crossing
- Add ingest idempotency support
- Add lifecycle transition guards

**Acceptance:** duplicate ingest retries are safe; live UI updates without polling; alerts fire correctly.

## Phase 5 — Retention + quality controls (PR #6)

- Retention/downsampling jobs
- Quality metrics (revert/hotfix heuristics)
- Integration tests and docs completion

**Acceptance:** storage growth controlled; quality metrics visible and documented.

---

## Rollout strategy

- Feature flags:
  - `CODE_METRICS_ENABLED`
  - `CODE_WEBHOOKS_ENABLED`
  - `INGEST_IDEMPOTENCY_ENABLED`
- Soft launch for 1 repo, then org-wide
- Keep existing polling UI as fallback until websocket wiring validated

---

## Risks and mitigations

1. **LoC vanity metric bias**
   - Mitigate by pairing with cycle time, review depth, revert/hotfix rates
2. **Webhook delivery loss**
   - Mitigate with reconciliation jobs + cursor checkpoints
3. **Provider API rate limits**
   - Backoff + ETag + bounded per-repo polling windows
4. **Historical backfill cost**
   - Chunked imports with checkpoint resume

---

## Definition of done

- `/code` route available with PR + LoC + latency visibility
- GitHub sync reliable (webhook + reconciliation)
- Ingest APIs idempotent for retry safety
- Realtime events and alerts wired to core lifecycle
- Production auth/health/migrations/retention baseline in place
- Runbook docs updated for operations

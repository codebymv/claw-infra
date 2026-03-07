# Backend Operations Runbook (Claw Infra)

This runbook documents the operational controls introduced through Phases 0–5.

## 1) Migration Discipline

- TypeORM `synchronize` is disabled in all environments.
- Production runs migrations automatically (`migrationsRun: true`).
- Create and apply migrations with:

```bash
npm run migration:create
npm run migration:generate
npm run migration:run
npm run migration:revert
```

## 2) Startup Validation

Startup fails fast when critical secrets are missing/weak:

- `JWT_SECRET` is required (and must be strong in production).
- If `CODE_WEBHOOKS_ENABLED=true`, then `GITHUB_WEBHOOK_SECRET` is required (and must be strong in production).

## 3) Deep Health Checks

`GET /api/health` includes dependency-level checks:

- postgres connectivity
- redis connectivity

Returns structured status (`ok` / `degraded` / `down`) with check details.

## 4) Code Visibility Surface

Backend code visibility endpoints:

- `GET /api/code/overview`
- `GET /api/code/trends`
- `GET /api/code/prs`
- `GET /api/code/quality`
- `POST /api/code/sync/backfill` (admin)
- `POST /api/code/webhooks/github` (signature validated)

## 5) Webhooks + Reconciliation

- GitHub webhook signatures are validated (sha256, with sha1 fallback support).
- Duplicate deliveries are replay-safe using `code_sync_state` high-watermark cursors.
- Reconciliation scheduler runs periodically (default `CODE_RECONCILIATION_INTERVAL_MINUTES=360`).

## 6) Ingest Idempotency

Optional idempotency on ingest routes using `Idempotency-Key`:

- Enable with `INGEST_IDEMPOTENCY_ENABLED=true`
- TTL configured by `INGEST_IDEMPOTENCY_TTL_HOURS`

Behavior:

- same key + route + token prefix replays the original response payload
- expired records are pruned by retention sweeps

## 7) Realtime + Alert Wiring

- Run lifecycle changes broadcast websocket run updates.
- Log and metrics ingest broadcast realtime updates.
- Alerts are wired for:
  - run failures
  - budget threshold crossings

## 8) Lifecycle Guards

Run and step transitions enforce legal state progression and terminal immutability.

Examples:

- queued -> running -> terminal
- terminal entities cannot transition to another state
- completed timestamps and durations are validated for consistency

## 9) Retention Jobs (Phase 5)

A periodic retention sweep now controls storage growth.

Env controls:

- `RETENTION_ENABLED` (default `true`)
- `RETENTION_SWEEP_INTERVAL_MINUTES` (default `60`, minimum `15`)
- `RETENTION_LOGS_DAYS` (default `30`)
- `RETENTION_METRICS_RAW_DAYS` (default `30`)
- `RETENTION_COSTS_DAYS` (default `540`)
- `RETENTION_CODE_DAILY_DAYS` (default `730`)

Sweep actions:

- delete old `agent_logs` by `created_at`
- delete old `resource_snapshots` by `recorded_at`
- delete old `cost_records` by `recorded_at`
- delete old `code_daily_metrics` by `day`
- prune expired idempotency keys

## 10) Operational Notes

- Keep webhook and JWT secrets managed by environment/secret manager.
- Tune retention windows per environment (dev/staging/prod).
- Review logs for retention sweep summary counts to confirm expected behavior.
- Ensure webhook replay behavior is periodically tested by sending duplicate deliveries.

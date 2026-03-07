# Backend migration workflow

This project uses **TypeORM migrations** for schema changes.

## Commands

Run from `backend/`:

```bash
npm run migration:create -- NameHere
npm run migration:generate
npm run migration:run
npm run migration:revert
```

## Baseline

A baseline migration is included at:

- `src/database/migrations/20260307000000-BaselineSchema.ts`

This establishes the existing schema under migration control.

## Policy

- Keep `synchronize: false` in app/runtime config.
- Apply schema updates through migrations only.
- In production, migrations are run automatically at startup (`migrationsRun: true`).

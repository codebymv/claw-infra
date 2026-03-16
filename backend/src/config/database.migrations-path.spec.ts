import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { buildTypeOrmConfig } from './database.config';

describe('database migration config', () => {
  it('disables implicit migration execution in favor of explicit startup runner', () => {
    const config = new ConfigService({ NODE_ENV: 'production' });
    const typeOrmConfig = buildTypeOrmConfig(config);

    expect(typeOrmConfig.migrationsRun).toBe(false);
  });

  it('includes compiled and source migration locations', () => {
    const config = new ConfigService({ NODE_ENV: 'production' });
    const typeOrmConfig = buildTypeOrmConfig(config);
    const migrations = typeOrmConfig.migrations as string[];

    expect(migrations).toEqual([
      join(__dirname, '..', 'database', 'migrations', '*.{js,ts}'),
    ]);
  });
});
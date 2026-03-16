import { ConfigService } from '@nestjs/config';
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

    expect(migrations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('database'),
        expect.stringContaining('dist'),
        expect.stringContaining('src'),
      ]),
    );
    expect(migrations.some((path) => path.includes('dist') && path.includes('migrations'))).toBe(true);
    expect(migrations.some((path) => path.includes('src') && path.includes('migrations'))).toBe(true);
  });
});
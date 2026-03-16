import { AddCompositeIndexes1710172800000 } from './1710172800000-AddCompositeIndexes';
import { AddModelPricing1710174000000 } from './1710174000000-AddModelPricing';
import { AddProjectManagementSchema1710175000000 } from './1710175000000-AddProjectManagementSchema';
import { AddChatSchema1710176000000 } from './1710176000000-AddChatSchema';

describe('production migrations', () => {
  const createRunner = () => ({ query: jest.fn().mockResolvedValue(undefined) });
  const getSql = (runner: { query: jest.Mock }) =>
    runner.query.mock.calls.map(([sql]) => String(sql));

  it('marks concurrent-index migrations as non-transactional', () => {
    expect(new AddCompositeIndexes1710172800000().transaction).toBe(false);
    expect(new AddProjectManagementSchema1710175000000().transaction).toBe(false);
    expect(new AddChatSchema1710176000000().transaction).toBe(false);
  });

  it('creates project and chat tables idempotently with pgcrypto available', async () => {
    const projectRunner = createRunner();
    await new AddProjectManagementSchema1710175000000().up(projectRunner as any);
    const projectSql = getSql(projectRunner as any);

    expect(projectSql[0]).toContain('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    expect(projectSql.filter((sql) => sql.includes('CREATE TABLE')).every((sql) => sql.includes('CREATE TABLE IF NOT EXISTS'))).toBe(true);

    const chatRunner = createRunner();
    await new AddChatSchema1710176000000().up(chatRunner as any);
    const chatSql = getSql(chatRunner as any);

    expect(chatSql[0]).toContain('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    expect(chatSql.filter((sql) => sql.includes('CREATE TABLE')).every((sql) => sql.includes('CREATE TABLE IF NOT EXISTS'))).toBe(true);
  });

  it('creates model pricing table and index idempotently', async () => {
    const runner = createRunner();
    await new AddModelPricing1710174000000().up(runner as any);
    const sql = getSql(runner as any);

    expect(sql.find((statement) => statement.includes('CREATE TABLE'))).toContain('CREATE TABLE IF NOT EXISTS');
    expect(sql.find((statement) => statement.includes('CREATE INDEX'))).toContain('CREATE INDEX IF NOT EXISTS');
  });
});
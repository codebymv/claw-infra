import { DATABASE_ENTITIES, buildTypeOrmConfig } from './database.config';
import { ChatMessage } from '../database/entities/chat-message.entity';
import { ChatSession } from '../database/entities/chat-session.entity';
import { Project } from '../database/entities/project.entity';

describe('database config', () => {
  it('registers chat entities needed by project relations', () => {
    expect(DATABASE_ENTITIES).toEqual(
      expect.arrayContaining([Project, ChatSession, ChatMessage]),
    );
  });

  it('passes the full entity registry into TypeORM config', () => {
    const config = {
      get: (key: string) =>
        ({
          NODE_ENV: 'development',
          DATABASE_URL: 'postgres://example',
        })[key],
    };

    const typeOrmConfig = buildTypeOrmConfig(config as any);

    expect(typeOrmConfig.entities).toBe(DATABASE_ENTITIES);
    expect(typeOrmConfig.entities).toEqual(
      expect.arrayContaining([ChatSession, ChatMessage]),
    );
  });
});
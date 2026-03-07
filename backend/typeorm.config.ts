import { DataSource } from 'typeorm';
import { DATABASE_ENTITIES } from './src/config/database.config';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: DATABASE_ENTITIES,
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

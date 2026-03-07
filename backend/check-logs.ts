import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { DataSource } from 'typeorm';

async function run() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const dataSource = app.get(DataSource);

    try {
        const logs = await dataSource.query(`
      SELECT run_id, message, created_at FROM agent_logs 
      WHERE message ILIKE '%tokens%'
      LIMIT 5
    `);

        console.log(logs);
    } catch (err) {
        console.error('Fetch failed:', err);
    }

    await app.close();
    process.exit(0);
}

run();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { DataSource } from 'typeorm';

async function run() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const dataSource = app.get(DataSource);

    try {
        const records = await dataSource.query(`
      SELECT model, SUM(tokens_in) as in_tokens, SUM(tokens_out) as out_tokens, COUNT(*) as calls
      FROM cost_records
      GROUP BY model
    `);

        console.log('Models found:', records);

    } catch (err) {
        console.error('Fetch failed:', err);
    }

    await app.close();
    process.exit(0);
}

run();

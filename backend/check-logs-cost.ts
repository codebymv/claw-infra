import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { DataSource } from 'typeorm';

async function run() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const dataSource = app.get(DataSource);

    try {
        const logs = await dataSource.query(`
      SELECT message FROM agent_logs 
      WHERE message ILIKE '%tokens%'
      LIMIT 10
    `);

        console.log('Sample Token Logs:');
        logs.forEach((l: any, i: number) => {
            console.log(`\n--- Log [${i}] ---`);
            console.log(l.message);
        });

    } catch (err) {
        console.error('Fetch failed:', err);
    }

    await app.close();
    process.exit(0);
}

run();

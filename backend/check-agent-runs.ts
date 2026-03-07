import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { DataSource } from 'typeorm';

async function run() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const dataSource = app.get(DataSource);

    try {
        const runCount = await dataSource.query(`SELECT COUNT(*) FROM agent_runs`);
        const stepCount = await dataSource.query(`SELECT COUNT(*) FROM agent_steps`);
        const costCount = await dataSource.query(`SELECT COUNT(*) FROM cost_records`);

        console.log('Total agent runs:', runCount[0]?.count);
        console.log('Total agent steps:', stepCount[0]?.count);
        console.log('Total cost records:', costCount[0]?.count);

        if (parseInt(runCount[0]?.count) > 0) {
            const runs = await dataSource.query(`SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT 1`);
            console.log('Latest run:', runs[0]);
        }
    } catch (err) {
        console.error('Fetch failed:', err);
    }

    await app.close();
    process.exit(0);
}

run();

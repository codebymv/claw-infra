import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { DataSource } from 'typeorm';

async function run() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const dataSource = app.get(DataSource);

    try {
        const totalCost = await dataSource.query(`SELECT SUM(CAST(cost_usd AS DECIMAL)) as total FROM cost_records`);
        const runIdStats = await dataSource.query(`SELECT (run_id IS NULL) as is_null, COUNT(*), SUM(CAST(cost_usd AS DECIMAL)) as sum FROM cost_records GROUP BY (run_id IS NULL)`);

        console.log(JSON.stringify({
            totalCost: totalCost[0].total,
            runIdStats
        }, null, 2));

    } catch (err) {
        console.error('Check failed:', err);
    }

    await app.close();
    process.exit(0);
}

run();

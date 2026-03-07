import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

async function run() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const dataSource = app.get(DataSource);

    try {
        const runCount = await dataSource.query(`SELECT COUNT(*) FROM code_runs`);
        const stepCount = await dataSource.query(`SELECT COUNT(*) FROM code_run_steps`);

        console.log('Total runs:', runCount[0]?.count);
        console.log('Total steps:', stepCount[0]?.count);

    } catch (err) {
        console.error('Fetch failed:', err);
    }

    await app.close();
    process.exit(0);
}

run();

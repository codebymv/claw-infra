import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CostRecord } from './src/database/entities/cost-record.entity';

async function run() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const costRepo = app.get(getRepositoryToken(CostRecord));

    console.log('Fetching cost records...');
    try {
        const rawCount = await costRepo.count();
        console.log('Total cost records in DB:', rawCount);

        const latest = await costRepo.find({ order: { recordedAt: 'DESC' }, take: 5 });
        console.log('Latest 5 records:', latest);
    } catch (err) {
        console.error('Fetch failed:', err);
    }

    await app.close();
    process.exit(0);
}

run();

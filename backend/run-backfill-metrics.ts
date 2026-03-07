import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { CodeSyncService } from './src/code/code.sync.service';

async function run() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const syncService = app.get(CodeSyncService);

    console.log('Triggering reconcile manually for "codebymv/claw-infra" to update PR metrics...');
    try {
        // Backfill 30 days of data
        const res = await syncService.backfillRepo('codebymv', 'claw-infra', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), new Date());
        console.log('Backfill result:', res);
    } catch (err) {
        console.error('Backfill failed:', err);
    }

    await app.close();
    process.exit(0);
}

run();

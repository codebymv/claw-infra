const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module.js');
const { CodeSyncService } = require('./dist/code/code.sync.service.js');

async function run() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const syncService = app.get(CodeSyncService);

    console.log('Triggering reconcile manually for a test repo...');
    try {
        // Try backfilling a known public repo or the current repo
        // e.g. ZeroClaw/claw-infra if it exists, or some small test repo
        const res = await syncService.backfillRepo('nestjs', 'nest', new Date(Date.now() - 24 * 60 * 60 * 1000), new Date());
        console.log('Backfill result:', res);
    } catch (err) {
        console.error('Backfill failed:', err);
    }

    await app.close();
}
run();

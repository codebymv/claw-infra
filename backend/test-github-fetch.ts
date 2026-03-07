import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { CodeProviderGithub } from './src/code/code.provider.github';

async function run() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const provider = app.get(CodeProviderGithub);

    console.log('Testing single PR fetch directly...');
    try {
        const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const to = new Date();
        const prs = await provider.fetchPullRequests({ owner: 'codebymv', name: 'claw-infra' }, from, to);

        console.log(`Fetched ${prs.length} PRs.`);
        if (prs.length > 0) {
            console.log('Sample PR output:', JSON.stringify(prs[0], null, 2));
        }
    } catch (err) {
        console.error('Fetch failed:', err);
    }

    await app.close();
    process.exit(0);
}

run();

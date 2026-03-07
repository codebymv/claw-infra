import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { CodeService } from './src/code/code.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CodePr } from './src/database/entities/code-pr.entity';

async function run() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const prRepository = app.get(getRepositoryToken(CodePr));

    console.log('Testing getOverview SQL...');
    try {
        const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const to = new Date();

        // Simulate getOverview query
        const prsQb = prRepository
            .createQueryBuilder('pr')
            .leftJoin('pr.repo', 'repo')
            .where('pr.opened_at BETWEEN :from AND :to', { from, to });

        const qb = prsQb
            .select('COUNT(*) FILTER (WHERE pr.opened_at BETWEEN :from AND :to)', 'prsOpened')
            .addSelect('COUNT(*) FILTER (WHERE pr.merged_at IS NOT NULL AND pr.merged_at BETWEEN :from AND :to)', 'prsMerged')
            .addSelect('COALESCE(SUM(pr.additions), 0)', 'additions')
            .addSelect('COALESCE(SUM(pr.deletions), 0)', 'deletions')
            .addSelect('COALESCE(SUM(pr.changed_files), 0)', 'changedFiles')
            .addSelect('COUNT(*) FILTER (WHERE pr.first_review_at IS NOT NULL)', 'reviewedPrs')
            .addSelect(
                'COALESCE(SUM(EXTRACT(EPOCH FROM (pr.merged_at - pr.opened_at))) FILTER (WHERE pr.merged_at IS NOT NULL), 0)',
                'mergeLatencySecondsTotal',
            )
            .addSelect('COUNT(*) FILTER (WHERE pr.merged_at IS NOT NULL)', 'mergeLatencyCount')
            .addSelect(
                'COALESCE(SUM(EXTRACT(EPOCH FROM (pr.first_review_at - pr.opened_at))) FILTER (WHERE pr.first_review_at IS NOT NULL), 0)',
                'firstReviewLatencySecondsTotal',
            )
            .addSelect('COUNT(*) FILTER (WHERE pr.first_review_at IS NOT NULL)', 'firstReviewLatencyCount');

        console.log('SQL:', qb.getSql());
        const rawParams = qb.getParameters();
        console.log('Params:', rawParams);

        const result = await qb.getRawOne();
        console.log('Result:', result);

    } catch (err) {
        console.error('Fetch failed:', err);
    }

    await app.close();
    process.exit(0);
}

run();

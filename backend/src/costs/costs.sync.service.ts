import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { CostRecord } from '../database/entities/cost-record.entity';
import { OpenRouterProvider } from './costs.provider.openrouter';

@Injectable()
export class CostsSyncService {
    private readonly logger = new Logger(CostsSyncService.name);

    constructor(
        @InjectRepository(CostRecord) private readonly costRepo: Repository<CostRecord>,
        private readonly openRouter: OpenRouterProvider
    ) { }

    @Cron(CronExpression.EVERY_HOUR)
    async syncOpenRouterCosts() {
        this.logger.log('Starting OpenRouter cost sync...');

        const generations = await this.openRouter.fetchGenerations(100);
        if (!generations.length) {
            this.logger.log('No new generations from OpenRouter to sync.');
            return;
        }

        let ingested = 0;

        // Reverse array to insert oldest first
        const records = generations.reverse();

        for (const gen of records) {
            const recordedAt = new Date(gen.created_at);

            // Look for a recent agent telemetry record that matches tokens and model within a 5-minute window.
            // E.g., agent logged "6475 prompt tokens" at 10:00:00 -> OpenRouter logged "6475 prompt tokens" at 10:00:02.
            // This attaches the exact $ cost value to existing run logs instead of duplicating!
            const match = await this.costRepo.createQueryBuilder('c')
                .where('c.model = :model', { model: gen.model })
                .andWhere('c.tokens_in = :in AND c.tokens_out = :out', { in: gen.tokens_prompt, out: gen.tokens_completion })
                .andWhere('c.recorded_at BETWEEN :start AND :end', {
                    start: new Date(recordedAt.getTime() - 5 * 60 * 1000),
                    end: new Date(recordedAt.getTime() + 5 * 60 * 1000)
                })
                .orderBy('c.recorded_at', 'ASC')
                .getOne();

            if (match) {
                // If the 6-decimal precision string differs (or if we previously approximated it), update!
                const preciseCost = gen.total_cost.toFixed(6);
                if (match.costUsd !== preciseCost) {
                    match.costUsd = preciseCost;
                    await this.costRepo.save(match);
                    ingested++;
                }
            } else {
                // If we don't match an agent run, we insert it as a 'global' cost.
                // We use exact timestamp, tokens, and model matching to prevent double-insertions on subsequent poll intervals.
                const exist = await this.costRepo.findOne({
                    where: {
                        runId: IsNull(),
                        model: gen.model,
                        tokensIn: gen.tokens_prompt,
                        tokensOut: gen.tokens_completion,
                        recordedAt
                    }
                });

                if (!exist) {
                    const newRecord = this.costRepo.create({
                        runId: null,
                        provider: 'openrouter',
                        model: gen.model,
                        tokensIn: gen.tokens_prompt,
                        tokensOut: gen.tokens_completion,
                        costUsd: gen.total_cost.toFixed(6),
                        recordedAt
                    });
                    await this.costRepo.save(newRecord);
                    ingested++;
                }
            }
        }

        this.logger.log(`OpenRouter sync complete. Reconciled/Ingested ${ingested} records.`);
    }
}

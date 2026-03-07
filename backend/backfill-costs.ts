import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CostRecord } from './src/database/entities/cost-record.entity';

const PATTERNS = {
    llmProvider: /provider[=:\s]+[`"']?(\w+)[`"']?/i,
    llmModel: /model[=:\s]+[`"']?([\w./-]+)[`"']?/i,
    llmTokensIn: /(?:input_tokens|tokens_in|prompt_tokens)[=:\s]+(?:Some\()?(\d+)\)?/i,
    llmTokensOut: /(?:output_tokens|tokens_out|completion_tokens)[=:\s]+(?:Some\()?(\d+)\)?/i,
    llmCost: /cost[=:\s]+(?:Some\()?\$?([\d.]+)\)?/i,
};

async function run() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const dataSource = app.get(DataSource);
    const costRepo = app.get(getRepositoryToken(CostRecord));

    console.log('Retroactively parsing ZeroClaw logs for LLM costs...');
    try {
        const logs = await dataSource.query(`
      SELECT run_id, message, created_at FROM agent_logs 
      WHERE message ILIKE '%openrouter%' OR message ILIKE '%tokens%' OR message ILIKE '%cost%'
      ORDER BY created_at ASC
    `);

        let injected = 0;

        // Group context by run_id
        const runStates = new Map<string, { provider: string; model: string }>();

        for (const log of logs) {
            if (!log.run_id) continue;

            const cleanMsg = log.message.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

            const providerMatch = PATTERNS.llmProvider.exec(cleanMsg);
            const modelMatch = PATTERNS.llmModel.exec(cleanMsg);

            let state = runStates.get(log.run_id) || { provider: 'openrouter', model: 'unknown' };

            if (providerMatch || modelMatch) {
                if (providerMatch) state.provider = providerMatch[1];
                if (modelMatch) state.model = modelMatch[1];
                runStates.set(log.run_id, state);
            }

            const tokensInMatch = PATTERNS.llmTokensIn.exec(cleanMsg);
            const tokensOutMatch = PATTERNS.llmTokensOut.exec(cleanMsg);
            const costMatch = PATTERNS.llmCost.exec(cleanMsg);

            const tokensIn = tokensInMatch ? parseInt(tokensInMatch[1]) : 0;
            const tokensOut = tokensOutMatch ? parseInt(tokensOutMatch[1]) : 0;
            const costUsd = costMatch ? costMatch[1] : '0';

            if (tokensIn > 0 || tokensOut > 0 || parseFloat(costUsd) > 0) {
                const record = costRepo.create({
                    runId: log.run_id,
                    provider: state.provider,
                    model: state.model,
                    tokensIn,
                    tokensOut,
                    costUsd,
                    recordedAt: log.created_at,
                });
                await costRepo.save(record);
                injected++;
            }
        }

        console.log(`Successfully retro-injected ${injected} CostRecord rows!`);

    } catch (err) {
        console.error('Backfill failed:', err);
    }

    await app.close();
    process.exit(0);
}

run();

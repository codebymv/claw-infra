import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { DataSource } from 'typeorm';

const PRICING_MAP: Record<string, { in: number; out: number }> = {
    'anthropic/claude-sonnet-4-6': { in: 3.0 / 1000000, out: 15.0 / 1000000 },
    'openai/gpt-5.3-codex': { in: 2.0 / 1000000, out: 10.0 / 1000000 },
};

async function run() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const dataSource = app.get(DataSource);

    try {
        const records = await dataSource.query(`SELECT id, model, tokens_in, tokens_out, cost_usd FROM cost_records`);
        let updated = 0;
        let totalCost = 0;

        for (const record of records) {
            if (parseFloat(record.cost_usd) === 0) {
                const pricing = PRICING_MAP[record.model] || { in: 0, out: 0 };
                const cost = (record.tokens_in * pricing.in) + (record.tokens_out * pricing.out);
                if (cost > 0) {
                    await dataSource.query(`UPDATE cost_records SET cost_usd = $1 WHERE id = $2`, [cost.toFixed(6), record.id]);
                    updated++;
                    totalCost += cost;
                }
            }
        }
        console.log(`Updated ${updated} records with calculated costs. Total retro cost: $${totalCost.toFixed(2)}`);
    } catch (err) {
        console.error('Update failed:', err);
    }

    await app.close();
    process.exit(0);
}

run();

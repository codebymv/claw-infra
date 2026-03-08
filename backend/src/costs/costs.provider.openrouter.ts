import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OpenRouterGeneration {
    id: string;
    model: string;
    tokens_prompt: number;
    tokens_completion: number;
    total_cost: number;
    created_at: string;
}

@Injectable()
export class OpenRouterProvider {
    private readonly logger = new Logger(OpenRouterProvider.name);
    private readonly apiUrl = 'https://openrouter.ai/api/v1/generations';

    constructor(private configService: ConfigService) { }

    async fetchGenerations(limit: number = 100): Promise<OpenRouterGeneration[]> {
        const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
        if (!apiKey) {
            this.logger.warn('OPENROUTER_API_KEY is not configured. Skipping OpenRouter sync.');
            return [];
        }

        try {
            const response = await fetch(`${this.apiUrl}?limit=${limit}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': this.configService.get<string>('FRONTEND_URL') || 'https://clawinfra.up.railway.app',
                    'X-Title': 'ClawInfra Telemetry Sync',
                },
            });

            if (!response.ok) {
                throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
            }

            const json = await response.json();
            return json.data || [];
        } catch (error) {
            this.logger.error(`Failed to fetch OpenRouter generations: ${(error as Error).message}`);
            return [];
        }
    }
}

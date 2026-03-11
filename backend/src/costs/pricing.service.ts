import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { ModelPricing } from '../database/entities/model-pricing.entity';

export interface PricingInfo {
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cacheDiscount: number;
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private readonly pricingCache = new Map<string, { pricing: PricingInfo; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    @InjectRepository(ModelPricing)
    private readonly pricingRepo: Repository<ModelPricing>,
  ) {}

  /**
   * Get pricing for a model at a specific date
   * Uses the most recent pricing effective on or before the given date
   */
  async getPricing(provider: string, model: string, asOfDate: Date = new Date()): Promise<PricingInfo> {
    const cacheKey = `${provider}:${model}:${asOfDate.toISOString().split('T')[0]}`;
    
    // Check cache
    const cached = this.pricingCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.pricing;
    }

    // Query database for most recent pricing effective on or before asOfDate
    const pricing = await this.pricingRepo.findOne({
      where: {
        provider,
        model,
        effectiveDate: LessThanOrEqual(asOfDate),
        isActive: true,
      },
      order: {
        effectiveDate: 'DESC',
      },
    });

    if (!pricing) {
      this.logger.warn(
        `No pricing found for ${provider}/${model} as of ${asOfDate.toISOString()}. Using default rate of 0.`,
      );
      return {
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
        cacheDiscount: 1.0,
      };
    }

    const result: PricingInfo = {
      inputPricePerMillion: parseFloat(pricing.inputPricePerMillion) / 1000000,
      outputPricePerMillion: parseFloat(pricing.outputPricePerMillion) / 1000000,
      cacheDiscount: parseFloat(pricing.cacheDiscount),
    };

    // Cache the result
    this.pricingCache.set(cacheKey, {
      pricing: result,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });

    return result;
  }

  /**
   * Create or update pricing for a model
   */
  async upsertPricing(
    provider: string,
    model: string,
    effectiveDate: Date,
    inputPricePerMillion: number,
    outputPricePerMillion: number,
    cacheDiscount: number = 1.0,
    notes?: string,
  ): Promise<ModelPricing> {
    const existing = await this.pricingRepo.findOne({
      where: { provider, model, effectiveDate },
    });

    if (existing) {
      existing.inputPricePerMillion = inputPricePerMillion.toString();
      existing.outputPricePerMillion = outputPricePerMillion.toString();
      existing.cacheDiscount = cacheDiscount.toString();
      if (notes !== undefined) existing.notes = notes;
      await this.pricingRepo.save(existing);
      
      // Invalidate cache
      this.invalidateCache(provider, model);
      
      return existing;
    }

    const pricing = this.pricingRepo.create({
      provider,
      model,
      effectiveDate,
      inputPricePerMillion: inputPricePerMillion.toString(),
      outputPricePerMillion: outputPricePerMillion.toString(),
      cacheDiscount: cacheDiscount.toString(),
      notes: notes || null,
    });

    const saved = await this.pricingRepo.save(pricing);
    
    // Invalidate cache
    this.invalidateCache(provider, model);
    
    return saved;
  }

  /**
   * List all pricing entries for a model
   */
  async listPricing(provider?: string, model?: string): Promise<ModelPricing[]> {
    const where: any = { isActive: true };
    if (provider) where.provider = provider;
    if (model) where.model = model;

    return this.pricingRepo.find({
      where,
      order: {
        provider: 'ASC',
        model: 'ASC',
        effectiveDate: 'DESC',
      },
    });
  }

  /**
   * Deactivate a pricing entry
   */
  async deactivatePricing(provider: string, model: string, effectiveDate: Date): Promise<void> {
    await this.pricingRepo.update(
      { provider, model, effectiveDate },
      { isActive: false },
    );
    
    // Invalidate cache
    this.invalidateCache(provider, model);
  }

  /**
   * Clear cache for a specific model
   */
  private invalidateCache(provider: string, model: string): void {
    const prefix = `${provider}:${model}:`;
    for (const key of this.pricingCache.keys()) {
      if (key.startsWith(prefix)) {
        this.pricingCache.delete(key);
      }
    }
  }

  /**
   * Clear entire pricing cache
   */
  clearCache(): void {
    this.pricingCache.clear();
  }
}

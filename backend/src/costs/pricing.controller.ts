import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PricingService } from './pricing.service';

class UpsertPricingDto {
  provider: string;
  model: string;
  effectiveDate: string; // ISO date string
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cacheDiscount?: number;
  notes?: string;
}

@Controller('admin/pricing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get()
  async listPricing(
    @Query('provider') provider?: string,
    @Query('model') model?: string,
  ) {
    return this.pricingService.listPricing(provider, model);
  }

  @Post()
  async createPricing(@Body() dto: UpsertPricingDto) {
    return this.pricingService.upsertPricing(
      dto.provider,
      dto.model,
      new Date(dto.effectiveDate),
      dto.inputPricePerMillion,
      dto.outputPricePerMillion,
      dto.cacheDiscount,
      dto.notes,
    );
  }

  @Put(':provider/:model/:effectiveDate')
  async updatePricing(
    @Param('provider') provider: string,
    @Param('model') model: string,
    @Param('effectiveDate') effectiveDate: string,
    @Body() dto: Partial<UpsertPricingDto>,
  ) {
    return this.pricingService.upsertPricing(
      provider,
      model,
      new Date(effectiveDate),
      dto.inputPricePerMillion!,
      dto.outputPricePerMillion!,
      dto.cacheDiscount,
      dto.notes,
    );
  }

  @Delete(':provider/:model/:effectiveDate')
  async deactivatePricing(
    @Param('provider') provider: string,
    @Param('model') model: string,
    @Param('effectiveDate') effectiveDate: string,
  ) {
    await this.pricingService.deactivatePricing(provider, model, new Date(effectiveDate));
    return { message: 'Pricing deactivated successfully' };
  }

  @Post('cache/clear')
  async clearCache() {
    this.pricingService.clearCache();
    return { message: 'Pricing cache cleared successfully' };
  }
}

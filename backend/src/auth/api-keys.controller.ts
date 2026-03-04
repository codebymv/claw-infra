import { Controller, Post, Get, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { AuthService } from './auth.service';
import { ApiKeyType } from '../database/entities/api-key.entity';

class CreateApiKeyDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsEnum(ApiKeyType)
  type?: ApiKeyType;
}

@Controller('auth/api-keys')
@UseGuards(AuthGuard('jwt'))
export class ApiKeysController {
  constructor(private readonly authService: AuthService) {}

  @Post()
  create(@Body() dto: CreateApiKeyDto) {
    return this.authService.createApiKey(dto.name, dto.type);
  }

  @Get()
  list() {
    return this.authService.listApiKeys();
  }

  @Delete(':id')
  revoke(@Param('id') id: string) {
    return this.authService.revokeApiKey(id);
  }
}

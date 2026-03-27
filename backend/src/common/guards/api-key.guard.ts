import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as bcrypt from 'bcrypt';
import { ApiKey, ApiKeyType } from '../../database/entities/api-key.entity';
import { CryptoUtil } from '../../auth/crypto.util';

export const API_KEY_TYPE_KEY = 'apiKeyType';
export const RequireApiKeyType = (type: ApiKeyType) =>
  SetMetadata(API_KEY_TYPE_KEY, type);

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly apiKeySecret: string;

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepo: Repository<ApiKey>,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    this.apiKeySecret =
      this.configService.get<string>('API_KEY_SECRET') || '';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const rawKey = request.headers['x-agent-token'] as string;

    if (!rawKey) {
      throw new UnauthorizedException('Missing X-Agent-Token header');
    }

    const requiredType = this.reflector.getAllAndOverride<
      ApiKeyType | undefined
    >(API_KEY_TYPE_KEY, [context.getHandler(), context.getClass()]);

    const prefix = rawKey.substring(0, 8);
    const candidates = await this.apiKeyRepo.find({
      where: { keyPrefix: prefix, isActive: true },
    });

    for (const candidate of candidates) {
      // Try HMAC validation first (current method)
      let matched = false;
      if (this.apiKeySecret) {
        matched = CryptoUtil.validateHmac(
          rawKey,
          candidate.keyHash,
          this.apiKeySecret,
        );
      }

      // Fallback to bcrypt for legacy keys
      if (!matched) {
        try {
          matched = await bcrypt.compare(rawKey, candidate.keyHash);
          if (matched && this.apiKeySecret) {
            // Re-hash with HMAC for future requests
            const newHash = CryptoUtil.hmacHash(rawKey, this.apiKeySecret);
            await this.apiKeyRepo.update(candidate.id, { keyHash: newHash });
          }
        } catch {
          // bcrypt comparison can throw on non-bcrypt hashes — skip
        }
      }

      if (matched) {
        if (candidate.expiresAt && candidate.expiresAt < new Date()) {
          throw new UnauthorizedException('API key expired');
        }
        if (requiredType && candidate.type !== requiredType) {
          throw new UnauthorizedException(
            `API key type '${candidate.type}' not allowed on this route`,
          );
        }
        await this.apiKeyRepo.update(candidate.id, { lastUsedAt: new Date() });
        return true;
      }
    }

    throw new UnauthorizedException('Invalid API key');
  }
}

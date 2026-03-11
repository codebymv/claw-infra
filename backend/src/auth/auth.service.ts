import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User } from '../database/entities/user.entity';
import { ApiKey, ApiKeyType } from '../database/entities/api-key.entity';
import { CryptoUtil } from './crypto.util';

@Injectable()
export class AuthService {
  private readonly apiKeySecret: string;

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(ApiKey) private readonly apiKeyRepo: Repository<ApiKey>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    this.apiKeySecret = this.config.get<string>('API_KEY_SECRET') || '';
    if (!this.apiKeySecret) {
      throw new Error('API_KEY_SECRET environment variable is required');
    }
  }

  async register(email: string, password: string, displayName?: string) {
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = this.userRepo.create({ email, passwordHash, displayName });
    await this.userRepo.save(user);
    return this.signToken(user);
  }

  async login(email: string, password: string) {
    const user = await this.userRepo.findOne({ where: { email, isActive: true } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.signToken(user);
  }

  private signToken(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    
    // Use JWT_SIGNING_SECRET if set, otherwise use JWT_SECRET
    const signingSecret = this.config.get<string>('JWT_SIGNING_SECRET') || this.config.get<string>('JWT_SECRET');
    
    return {
      access_token: this.jwtService.sign(payload, signingSecret ? { secret: signingSecret } : undefined),
      user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
    };
  }

  async createApiKey(name: string, type: ApiKeyType = ApiKeyType.AGENT) {
    const rawKey = CryptoUtil.generateApiKey(32);
    const prefix = rawKey.substring(0, 8);
    const keyHash = CryptoUtil.hmacHash(rawKey, this.apiKeySecret);

    const apiKey = this.apiKeyRepo.create({ name, keyHash, keyPrefix: prefix, type });
    await this.apiKeyRepo.save(apiKey);

    return { id: apiKey.id, name, key: rawKey, prefix, createdAt: apiKey.createdAt };
  }

  async validateApiKey(providedKey: string): Promise<ApiKey | null> {
    const prefix = providedKey.substring(0, 8);
    const candidates = await this.apiKeyRepo.find({
      where: { keyPrefix: prefix, isActive: true },
    });

    for (const candidate of candidates) {
      // Try HMAC validation first (new method)
      if (CryptoUtil.validateHmac(providedKey, candidate.keyHash, this.apiKeySecret)) {
        // Update last used timestamp
        await this.apiKeyRepo.update(candidate.id, { lastUsedAt: new Date() });
        return candidate;
      }

      // Fallback to bcrypt for backward compatibility (30-day grace period)
      // TODO: Remove after 2026-04-11
      try {
        const bcryptValid = await bcrypt.compare(providedKey, candidate.keyHash);
        if (bcryptValid) {
          // Re-hash with HMAC for future requests
          const newHash = CryptoUtil.hmacHash(providedKey, this.apiKeySecret);
          await this.apiKeyRepo.update(candidate.id, {
            keyHash: newHash,
            lastUsedAt: new Date(),
          });
          return candidate;
        }
      } catch {
        // bcrypt comparison failed, continue to next candidate
      }
    }

    return null;
  }

  async listApiKeys() {
    return this.apiKeyRepo.find({ select: ['id', 'name', 'keyPrefix', 'type', 'isActive', 'lastUsedAt', 'expiresAt', 'createdAt'] });
  }

  async revokeApiKey(id: string) {
    await this.apiKeyRepo.update(id, { isActive: false });
  }
}

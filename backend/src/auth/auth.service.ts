import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { User } from '../database/entities/user.entity';
import { ApiKey, ApiKeyType } from '../database/entities/api-key.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(ApiKey) private readonly apiKeyRepo: Repository<ApiKey>,
    private readonly jwtService: JwtService,
  ) {}

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
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
    };
  }

  async createApiKey(name: string, type: ApiKeyType = ApiKeyType.AGENT) {
    const rawKey = randomBytes(32).toString('hex');
    const prefix = rawKey.substring(0, 8);
    const keyHash = await bcrypt.hash(rawKey, 10);

    const apiKey = this.apiKeyRepo.create({ name, keyHash, keyPrefix: prefix, type });
    await this.apiKeyRepo.save(apiKey);

    return { id: apiKey.id, name, key: rawKey, prefix, createdAt: apiKey.createdAt };
  }

  async listApiKeys() {
    return this.apiKeyRepo.find({ select: ['id', 'name', 'keyPrefix', 'type', 'isActive', 'lastUsedAt', 'expiresAt', 'createdAt'] });
  }

  async revokeApiKey(id: string) {
    await this.apiKeyRepo.update(id, { isActive: false });
  }
}

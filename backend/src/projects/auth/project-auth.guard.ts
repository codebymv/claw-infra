import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from '../../database/entities/api-key.entity';
import { User } from '../../database/entities/user.entity';
import { AuthService } from '../../auth/auth.service';
import { CryptoUtil } from '../../auth/crypto.util';

@Injectable()
export class ProjectAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly authService: AuthService,
    @InjectRepository(ApiKey) private readonly apiKeyRepo: Repository<ApiKey>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Try JWT authentication first
    const jwtToken = this.extractJwtToken(request);
    if (jwtToken) {
      const user = await this.validateJwtToken(jwtToken);
      if (user) {
        request.user = user;
        return true;
      }
    }

    // Try API key authentication
    const apiKey = this.extractApiKey(request);
    if (apiKey) {
      const user = await this.validateApiKey(apiKey);
      if (user) {
        request.user = user;
        return true;
      }
    }

    throw new UnauthorizedException('Authentication required');
  }

  private extractJwtToken(request: any): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }

  private extractApiKey(request: any): string | null {
    return (
      request.headers['x-agent-token'] || request.headers['x-api-key'] || null
    );
  }

  private async validateJwtToken(token: string): Promise<any> {
    try {
      // Get JWT secrets from config
      const secretsEnv = this.config.get<string>('JWT_SECRETS');
      const singleSecret = this.config.get<string>('JWT_SECRET');

      let secrets: string[];
      if (secretsEnv) {
        secrets = secretsEnv
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (singleSecret) {
        secrets = [singleSecret];
      } else {
        return null;
      }

      // Try each secret
      for (const secret of secrets) {
        try {
          const payload = this.jwtService.verify(token, { secret });
          return { id: payload.sub, email: payload.email, role: payload.role };
        } catch {
          continue;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private async validateApiKey(providedKey: string): Promise<any> {
    try {
      const apiKey = await this.authService.validateApiKey(providedKey);
      if (!apiKey) {
        return null;
      }

      // API keys should NOT have automatic admin access to all projects
      // They need to be explicitly granted access via project membership
      // For project-scoped operations, ProjectAccessGuard will check membership
      
      // Create a minimal user context for API key
      // The isApiKey flag allows downstream guards to handle appropriately
      return {
        id: `apikey:${apiKey.id}`,
        email: `apikey@${apiKey.name.toLowerCase().replace(/\s+/g, '-')}`,
        role: 'user', // Default role - actual permissions depend on project membership
        apiKey: apiKey,
        isApiKey: true,
        apiKeyType: apiKey.type,
      };
    } catch {
      return null;
    }
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly jwtSecrets: string[];
  private readonly signingSecret: string;

  constructor(private readonly config: ConfigService) {
    // Parse JWT_SECRETS (comma-separated list) or fall back to JWT_SECRET
    const secretsEnv = config.get<string>('JWT_SECRETS');
    const singleSecret = config.get<string>('JWT_SECRET');
    
    if (secretsEnv) {
      const secrets = secretsEnv.split(',').map(s => s.trim()).filter(Boolean);
      if (secrets.length === 0) {
        throw new Error('JWT_SECRETS is set but contains no valid secrets');
      }
      
      // Use first secret for validation by default (passport-jwt limitation)
      super({
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        ignoreExpiration: false,
        secretOrKey: secrets[0],
      });
      
      // Store all secrets for manual validation fallback
      // @ts-ignore - accessing private property for multi-secret support
      this.jwtSecrets = secrets;
    } else if (singleSecret) {
      super({
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        ignoreExpiration: false,
        secretOrKey: singleSecret,
      });
      // @ts-ignore
      this.jwtSecrets = [singleSecret];
    } else {
      throw new Error('Either JWT_SECRET or JWT_SECRETS must be set');
    }

    // Get signing secret (defaults to first secret in list)
    this.signingSecret = config.get<string>('JWT_SIGNING_SECRET') || this.jwtSecrets[0];
    
    // Warn if signing secret is not in the secrets list
    if (!this.jwtSecrets.includes(this.signingSecret)) {
      console.warn('[JWT] JWT_SIGNING_SECRET is not present in JWT_SECRETS list. This may cause validation failures.');
    }
  }

  async validate(payload: JwtPayload) {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }

  // Override authenticate to support multiple secrets
  authenticate(req: any, options?: any) {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    
    if (!token) {
      return super.authenticate(req, options);
    }

    // Try each secret until one works
    for (const secret of this.jwtSecrets) {
      try {
        const decoded = jwt.verify(token, secret) as JwtPayload;
        // Manually call validate and attach user to request
        req.user = this.validate(decoded);
        return this.success(req.user);
      } catch (err) {
        // Continue to next secret
        continue;
      }
    }

    // If no secret worked, fail authentication
    return this.fail(new UnauthorizedException('Invalid token'));
  }
}

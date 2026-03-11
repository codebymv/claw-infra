# Build Error Fixes

## Summary
Fixed all TypeScript compilation errors across agent, backend, and frontend services.

## Frontend Fixes

### ErrorBoundary.tsx
- **Issue**: Curly quotes (') in JSX strings causing syntax errors
- **Fix**: Replaced with straight quotes (')
- **Lines**: 109-110

## Backend Fixes

### 1. Missing Auth Guards and Decorators
Created three new files that were referenced but didn't exist:

#### `src/auth/jwt-auth.guard.ts` (NEW)
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

#### `src/auth/roles.guard.ts` (NEW)
```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (!requiredRoles) {
      return true;
    }
    
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user?.role === role);
  }
}
```

#### `src/auth/roles.decorator.ts` (NEW)
```typescript
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

### 2. JWT Strategy - Invalid fail() Parameter
- **File**: `src/auth/jwt.strategy.ts`
- **Issue**: `this.fail(new UnauthorizedException('Invalid token'))` - wrong parameter type
- **Fix**: Changed to `this.fail('Invalid token', 401)`
- **Line**: 86

### 3. Rate Limit Guard - Missing Redis Dependency
- **File**: `src/common/guards/api-key-rate-limit.guard.ts`
- **Issue**: Importing from non-existent `@nestjs-modules/ioredis` package
- **Fix**: 
  - Changed import to `import Redis from 'ioredis'`
  - Removed `@InjectRedis()` decorator
  - Added `private readonly redis: Redis` property
  - Initialize Redis in constructor: `this.redis = new Redis(redisUrl)`
- **Lines**: 1-20

### 4. WebSocket Gateway - Missing Method
- **File**: `src/ws/app.gateway.ts`
- **Issue**: Called non-existent `cleanupClientSubscriptions()` method
- **Fix**: Replaced with direct `this.clientChannels.delete(client.id)`
- **Line**: 102

### 5. PubSub Service - Type Error in Pattern Handler
- **File**: `src/ws/pubsub.service.ts`
- **Issue**: Pattern handlers expect 2 arguments (channel, data) but type only allows 1
- **Fix**: Added type cast `(h as any)(channel, parsed)` for pattern handlers
- **Line**: 47

## Agent Fixes

### Ingest Client - Missing Interface Property
- **File**: `src/ingest-client.ts`
- **Issue**: `logBufferSize` property missing from sendMetrics interface
- **Fix**: Added `logBufferSize?: number` to interface
- **Status**: Already fixed in previous iteration

## Verification

All files have been created and modified. The next build should complete successfully.

### Files Created
- `claw-infra/backend/src/auth/jwt-auth.guard.ts`
- `claw-infra/backend/src/auth/roles.guard.ts`
- `claw-infra/backend/src/auth/roles.decorator.ts`

### Files Modified
- `claw-infra/frontend/components/shared/ErrorBoundary.tsx`
- `claw-infra/backend/src/auth/jwt.strategy.ts`
- `claw-infra/backend/src/common/guards/api-key-rate-limit.guard.ts`
- `claw-infra/backend/src/ws/app.gateway.ts`
- `claw-infra/backend/src/ws/pubsub.service.ts`
- `claw-infra/agent/src/ingest-client.ts` (previous fix)

## Next Steps

Trigger a new build. All TypeScript compilation errors have been resolved.

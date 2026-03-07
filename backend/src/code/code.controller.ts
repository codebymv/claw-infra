import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { CodePrState } from '../database/entities/code-pr.entity';
import { verifyGithubSignature } from './github-signature.util';
import { CodeService } from './code.service';
import { CodeSyncService } from './code.sync.service';

class BaseCodeQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  repo?: string;

  @IsOptional()
  @IsString()
  author?: string;
}

class TrendsQueryDto extends BaseCodeQueryDto {
  @IsOptional()
  @IsString()
  bucket?: 'day';
}

class PrsQueryDto extends BaseCodeQueryDto {
  @IsOptional()
  @IsEnum(CodePrState)
  state?: CodePrState;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsNumber()
  @Min(1)
  @Max(200)
  limit?: number;
}

class BackfillDto {
  @IsOptional()
  @IsString()
  repo?: string;
}

function resolveRange(from?: string, to?: string) {
  const resolvedTo = to ? new Date(to) : new Date();
  const resolvedFrom = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return { from: resolvedFrom, to: resolvedTo };
}

interface AuthRequestUser {
  id: string;
  email: string;
  role: string;
}

interface GithubWebhookRequest extends Request {
  rawBody?: Buffer;
  user?: AuthRequestUser;
}

@Controller('code')
export class CodeController {
  private readonly logger = new Logger(CodeController.name);

  constructor(
    private readonly codeService: CodeService,
    private readonly codeSyncService: CodeSyncService,
    private readonly config: ConfigService,
  ) {}

  @Get('overview')
  @UseGuards(AuthGuard('jwt'))
  getOverview(@Query() query: BaseCodeQueryDto) {
    const { from, to } = resolveRange(query.from, query.to);
    return this.codeService.getOverview({ from, to, repo: query.repo, author: query.author });
  }

  @Get('trends')
  @UseGuards(AuthGuard('jwt'))
  getTrends(@Query() query: TrendsQueryDto) {
    const { from, to } = resolveRange(query.from, query.to);
    return this.codeService.getTrends({
      from,
      to,
      repo: query.repo,
      author: query.author,
      bucket: query.bucket || 'day',
    });
  }

  @Get('prs')
  @UseGuards(AuthGuard('jwt'))
  listPrs(@Query() query: PrsQueryDto) {
    const { from, to } = resolveRange(query.from, query.to);
    return this.codeService.listPrs({
      from,
      to,
      repo: query.repo,
      author: query.author,
      state: query.state,
      page: query.page || 1,
      limit: Math.min(query.limit || 20, 200),
    });
  }

  @Get('quality')
  @UseGuards(AuthGuard('jwt'))
  getQuality(@Query() query: BaseCodeQueryDto) {
    const { from, to } = resolveRange(query.from, query.to);
    return this.codeService.getQuality({ from, to, repo: query.repo, author: query.author });
  }

  @Post('sync/backfill')
  @UseGuards(AuthGuard('jwt'))
  triggerBackfill(@Body() body: BackfillDto, @Req() req: Request & { user?: AuthRequestUser }) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Admin role required');
    }
    return this.codeService.triggerBackfill(body.repo);
  }

  @Post('webhooks/github')
  @HttpCode(HttpStatus.ACCEPTED)
  async handleGithubWebhook(
    @Req() req: GithubWebhookRequest,
    @Body() body: unknown,
  ) {
    const webhooksEnabled = this.config.get<string>('CODE_WEBHOOKS_ENABLED') !== 'false';
    if (!webhooksEnabled) {
      throw new ForbiddenException('Code webhooks are disabled');
    }

    const event = (req.headers['x-github-event'] as string | undefined) || 'unknown';
    const deliveryId = (req.headers['x-github-delivery'] as string | undefined) || `delivery-${Date.now()}`;
    const signature256 = req.headers['x-hub-signature-256'] as string | undefined;
    const signature = req.headers['x-hub-signature'] as string | undefined;
    const secret = this.config.get<string>('GITHUB_WEBHOOK_SECRET') || '';

    if (!secret) {
      this.logger.error('GITHUB_WEBHOOK_SECRET is missing; rejecting webhook');
      throw new ForbiddenException('Webhook secret is not configured');
    }

    const rawBody = req.rawBody || Buffer.from(JSON.stringify(body));
    const result256 = verifyGithubSignature(rawBody, signature256, secret);
    const resultSha1 = verifyGithubSignature(rawBody, signature, secret);

    if (!result256.valid && !resultSha1.valid) {
      this.logger.warn(`GitHub webhook signature validation failed for delivery ${deliveryId}`);
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return this.codeSyncService.processGithubWebhook(event, deliveryId, body);
  }
}

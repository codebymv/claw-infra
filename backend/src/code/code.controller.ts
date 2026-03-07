import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { Request } from 'express';
import { CodePrState } from '../database/entities/code-pr.entity';
import { CodeService } from './code.service';

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

@Controller('code')
@UseGuards(AuthGuard('jwt'))
export class CodeController {
  constructor(private readonly codeService: CodeService) {}

  @Get('overview')
  getOverview(@Query() query: BaseCodeQueryDto) {
    const { from, to } = resolveRange(query.from, query.to);
    return this.codeService.getOverview({ from, to, repo: query.repo, author: query.author });
  }

  @Get('trends')
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
  getQuality(@Query() query: BaseCodeQueryDto) {
    const { from, to } = resolveRange(query.from, query.to);
    return this.codeService.getQuality({ from, to, repo: query.repo, author: query.author });
  }

  @Post('sync/backfill')
  triggerBackfill(@Body() body: BackfillDto, @Req() req: Request & { user?: AuthRequestUser }) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Admin role required');
    }
    return this.codeService.triggerBackfill(body.repo);
  }
}

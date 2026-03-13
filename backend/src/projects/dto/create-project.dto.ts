import { IsString, IsOptional, IsEnum, IsObject, Length, Matches } from 'class-validator';
import { ProjectVisibility } from '../../database/entities/project.entity';

export class CreateProjectDto {
  @IsString()
  @Length(1, 100)
  name: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug must contain only lowercase letters, numbers, and hyphens' })
  slug?: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsEnum(ProjectVisibility)
  visibility?: ProjectVisibility;

  @IsOptional()
  @IsObject()
  settings?: {
    allowAgentAccess?: boolean;
    autoArchiveInactiveDays?: number;
    defaultCardTemplate?: string;
    workflowRules?: any[];
    notificationSettings?: any;
  };
}
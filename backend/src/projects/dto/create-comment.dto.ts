import { IsString, IsOptional, IsUUID, Length } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @Length(1, 10000)
  content: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}

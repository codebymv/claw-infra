import { IsUUID, IsOptional, IsInt, Min } from 'class-validator';

export class MoveCardDto {
  @IsUUID()
  targetColumnId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  Length,
} from 'class-validator';
import { BoardLayout } from '../../database/entities/kanban-board.entity';

export class CreateBoardDto {
  @IsString()
  @Length(1, 100)
  name: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsObject()
  layout?: Partial<BoardLayout>;
}

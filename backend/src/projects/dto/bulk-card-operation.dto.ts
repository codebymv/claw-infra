import {
  IsArray,
  IsUUID,
  IsOptional,
  IsEnum,
  IsObject,
  ArrayNotEmpty,
} from 'class-validator';
import { CardStatus, CardPriority } from '../../database/entities/card.entity';

export class BulkCardOperationDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  cardIds: string[];

  @IsEnum(['update', 'move', 'delete'])
  operation: 'update' | 'move' | 'delete';

  @IsOptional()
  @IsObject()
  updateData?: {
    status?: CardStatus;
    priority?: CardPriority;
    assigneeId?: string;
    tags?: string[];
    customFields?: Record<string, any>;
  };

  @IsOptional()
  @IsUUID()
  targetColumnId?: string;
}

import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsArray,
  IsObject,
  IsDateString,
  IsDecimal,
  Length,
  Min,
} from 'class-validator';
import {
  CardType,
  CardPriority,
  CardStatus,
} from '../../database/entities/card.entity';

export class UpdateCardDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 10000)
  description?: string;

  @IsOptional()
  @IsEnum(CardType)
  type?: CardType;

  @IsOptional()
  @IsEnum(CardPriority)
  priority?: CardPriority;

  @IsOptional()
  @IsEnum(CardStatus)
  status?: CardStatus;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  estimatedHours?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  actualHours?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsObject()
  customFields?: Record<string, any>;

  @IsOptional()
  @Min(0)
  position?: number;
}

import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class ReorderColumnsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  columnIds: string[];
}
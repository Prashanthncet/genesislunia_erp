import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DOC_TYPES } from './workflow';

const YEAR = /^\d{4}-\d{2}$/;
const YEAR_MSG = 'academic_year must look like 2026-27';
export const FIELD_TYPES = ['text', 'number', 'date', 'email', 'phone', 'select', 'textarea'];

export class CreateFieldDto {
  @IsString() @IsNotEmpty() @MaxLength(80)
  label!: string;

  @IsIn(FIELD_TYPES)
  field_type!: string;

  @IsOptional() @IsBoolean()
  is_required?: boolean;

  @IsOptional() @IsString() @MaxLength(200)
  validation_rule?: string;

  @IsOptional() @Matches(YEAR, { message: YEAR_MSG })
  academic_year?: string;
}

export class UpdateFieldDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80)
  label?: string;

  @IsOptional() @IsIn(FIELD_TYPES)
  field_type?: string;

  @IsOptional() @IsBoolean()
  is_required?: boolean;

  @IsOptional() @IsString() @MaxLength(200)
  validation_rule?: string;
}

export class ReorderFieldsDto {
  @Matches(YEAR, { message: YEAR_MSG })
  academic_year!: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsString({ each: true })
  ids!: string[];
}

export class CopyTemplateDto {
  @Matches(YEAR, { message: YEAR_MSG })
  from_year!: string;
}

export class RemarksDto {
  @IsString() @IsNotEmpty() @MaxLength(1000)
  remarks!: string;
}

export class OptionalRemarksDto {
  @IsOptional() @IsString() @MaxLength(1000)
  remarks?: string;
}

export class ParentInviteDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  parent_name!: string;

  @IsOptional() @IsEmail() @MaxLength(160)
  parent_email?: string;

  @IsOptional() @Matches(/^\+?[0-9 -]{7,16}$/, { message: 'parent_contact must be a phone number' })
  parent_contact?: string;
}

export class TriggerLinksDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50)
  @ValidateNested({ each: true }) @Type(() => ParentInviteDto)
  parents!: ParentInviteDto[];

  @IsOptional() @Matches(YEAR, { message: YEAR_MSG })
  academic_year?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(10_000_000)
  fee_amount?: number;
}

export class ValidateDto {
  /** true → Document Validated, false → Re-submit (remarks required). */
  @IsOptional() @IsBoolean()
  is_valid?: boolean;

  /** Legacy camelCase spelling of is_valid. */
  @IsOptional() @IsBoolean()
  isValid?: boolean;

  @IsOptional() @IsString() @MaxLength(1000)
  remarks?: string;
}

export class OfflinePaymentDto {
  @IsString() @IsNotEmpty() @MaxLength(80)
  reference_no!: string;

  @IsOptional() @IsIn(['Cash', 'Cheque', 'DD', 'UPI', 'Bank Transfer', 'Card'])
  payment_mode?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(10_000_000)
  amount?: number;
}

export class ReceiptFileDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  file_name!: string;

  @IsString() @IsNotEmpty()
  data_url!: string;
}

export class FeeApproveDto {
  /** Receipt number; generated as ADM-RCPT-YYYY-NNNN when omitted. */
  @IsOptional() @IsString() @MaxLength(60)
  receipt_no?: string;

  @IsOptional() @ValidateNested() @Type(() => ReceiptFileDto)
  receipt?: ReceiptFileDto;

  @IsOptional() @IsString() @MaxLength(1000)
  remarks?: string;
}

export class AllocateDto {
  @IsOptional() @IsString() @MaxLength(60)
  class_id?: string;
}

export class SignDto {
  /** Full name typed by the principal as the digital signature. */
  @IsString() @IsNotEmpty() @MaxLength(120)
  signature_name!: string;

  @IsOptional() @IsString() @MaxLength(1000)
  remarks?: string;
}

export class UploadDocumentDto {
  @IsIn(DOC_TYPES)
  doc_type!: string;

  @IsString() @IsNotEmpty() @MaxLength(120)
  file_name!: string;

  @IsString() @IsNotEmpty()
  data_url!: string;
}

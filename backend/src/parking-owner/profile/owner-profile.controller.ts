import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { kycUploadSchema, ownerProfileSchema } from '@qp/validation';
import { type z } from 'zod';
import { type AuthUser } from '../../shared/auth/auth.types';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { MAX_UPLOAD_BYTES, type UploadedFile as File } from '../../shared/files/storage.service';
import { ApiZodBody, ZodBody } from '../../shared/http/decorators/zod.decorators';
import { OwnerProfileService } from './owner-profile.service';

@ApiTags('owner: profile & KYC')
@ApiBearerAuth()
@Roles('PARKING_OWNER')
@Controller('owner')
export class OwnerProfileController {
  constructor(private readonly profile: OwnerProfileService) {}

  /** null until the owner saves a profile. */
  @Get('profile')
  get(@CurrentUser() user: AuthUser) {
    return this.profile.get(user.id);
  }

  @Put('profile')
  @ApiZodBody(ownerProfileSchema)
  put(@CurrentUser() user: AuthUser, @ZodBody(ownerProfileSchema) body: z.output<typeof ownerProfileSchema>) {
    return this.profile.upsert(user.id, body);
  }

  /** multipart/form-data: file (PDF/JPG/PNG/WebP ≤ 5 MB) + docType */
  @Post('kyc/documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file: File | undefined, @ZodBody(kycUploadSchema) body: z.output<typeof kycUploadSchema>) {
    return this.profile.uploadDocument(user.id, body.docType, file);
  }

  @Delete('kyc/documents/:id')
  deleteDoc(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.profile.deleteDocument(user.id, id);
  }

  @Post('kyc/submit')
  @HttpCode(HttpStatus.OK)
  submit(@CurrentUser() user: AuthUser) {
    return this.profile.submit(user.id);
  }
}

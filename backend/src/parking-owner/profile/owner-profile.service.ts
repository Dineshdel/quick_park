import { HttpStatus, Injectable } from '@nestjs/common';
import { type Owner, type OwnerKycDocument } from '@prisma/client';
import { REQUIRED_KYC_DOCS, type KycDocType, type OwnerProfileDto } from '@qp/types';
import { type ownerProfileSchema } from '@qp/validation';
import { type z } from 'zod';
import { PrismaService } from '../../shared/database/prisma.service';
import { DOC_TYPES, MAX_UPLOAD_BYTES, StorageService, type UploadedFile } from '../../shared/files/storage.service';
import { AppException, Errors } from '../../shared/http/app-exception';
import { OwnerContext } from '../owner-context.service';

const toDto = (o: Owner & { documents: OwnerKycDocument[] }): OwnerProfileDto => ({
  id: o.id,
  businessName: o.businessName,
  phone: o.phone,
  address: o.address,
  panNumber: o.panNumber,
  gstin: o.gstin,
  bankAccountName: o.bankAccountName,
  bankAccountNumber: o.bankAccountNumber,
  bankIfsc: o.bankIfsc,
  upiId: o.upiId,
  kycStatus: o.kycStatus,
  kycRejectionReason: o.kycRejectionReason,
  kycSubmittedAt: o.kycSubmittedAt?.toISOString() ?? null,
  documents: o.documents.map((d) => ({
    id: d.id,
    docType: d.docType,
    fileName: d.fileName,
    contentType: d.contentType,
    sizeBytes: d.sizeBytes,
    uploadedAt: d.uploadedAt.toISOString(),
  })),
});

const locked = () =>
  new AppException(HttpStatus.CONFLICT, 'INVALID_STATE', 'Your verification is under review. You can edit again if it is rejected.');

/** Owner business profile, bank details and KYC (plan M4). KYC documents go to PRIVATE storage. */
@Injectable()
export class OwnerProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ctx: OwnerContext,
  ) {}

  async get(userId: string): Promise<OwnerProfileDto | null> {
    const o = await this.prisma.owner.findUnique({ where: { userId }, include: { documents: { orderBy: { uploadedAt: 'asc' } } } });
    return o && toDto(o);
  }

  async upsert(userId: string, input: z.output<typeof ownerProfileSchema>): Promise<OwnerProfileDto> {
    const existing = await this.prisma.owner.findUnique({ where: { userId } });
    if (existing?.kycStatus === 'PENDING') throw locked();
    // Changing identity or bank details after approval sends the owner back through review.
    const sensitive = (['panNumber', 'gstin', 'bankAccountNumber', 'bankIfsc', 'upiId', 'businessName'] as const).some(
      (k) => existing && input[k] !== undefined && (input[k] ?? null) !== existing[k],
    );
    const resetKyc = existing?.kycStatus === 'APPROVED' && sensitive ? { kycStatus: 'NOT_SUBMITTED' as const, kycReviewedAt: null } : {};
    const o = await this.prisma.owner.upsert({
      where: { userId },
      create: { userId, ...input },
      update: { ...input, ...resetKyc },
      include: { documents: true },
    });
    return toDto(o);
  }

  async uploadDocument(userId: string, docType: KycDocType, file: UploadedFile | undefined) {
    const o = await this.ctx.owner(userId);
    if (o.kycStatus === 'PENDING') throw locked();
    const { key, contentType } = await this.storage.save('private', `kyc/${o.id}`, file, { allowed: DOC_TYPES, maxBytes: MAX_UPLOAD_BYTES });
    await this.prisma.ownerKycDocument.create({
      data: { ownerId: o.id, docType, storageKey: key, contentType, fileName: file!.originalname.slice(0, 200), sizeBytes: file!.size },
    });
    if (o.kycStatus === 'APPROVED') await this.prisma.owner.update({ where: { id: o.id }, data: { kycStatus: 'NOT_SUBMITTED' } });
    return (await this.get(userId))!;
  }

  async deleteDocument(userId: string, docId: string) {
    const o = await this.ctx.owner(userId);
    if (o.kycStatus === 'PENDING') throw locked();
    const doc = await this.prisma.ownerKycDocument.findFirst({ where: { id: docId, ownerId: o.id } });
    if (!doc) throw Errors.notFound('Document');
    await this.prisma.ownerKycDocument.delete({ where: { id: doc.id } });
    await this.storage.remove('private', doc.storageKey);
    return (await this.get(userId))!;
  }

  async submit(userId: string) {
    const o = await this.prisma.owner.findUnique({ where: { userId }, include: { documents: true } });
    if (!o) throw new AppException(HttpStatus.FORBIDDEN, 'OWNER_PROFILE_REQUIRED', 'Fill in your business profile first');
    if (o.kycStatus === 'PENDING' || o.kycStatus === 'APPROVED') {
      throw new AppException(HttpStatus.CONFLICT, 'INVALID_STATE', 'Already submitted');
    }
    const missing: { path: string; message: string }[] = [];
    if (!o.panNumber) missing.push({ path: 'panNumber', message: 'PAN number is required' });
    if (!(o.bankAccountNumber && o.bankIfsc && o.bankAccountName) && !o.upiId) {
      missing.push({ path: 'bankAccountNumber', message: 'Add bank details (name, account number, IFSC) or a UPI id for payouts' });
    }
    for (const t of REQUIRED_KYC_DOCS) {
      if (!o.documents.some((d) => d.docType === t)) missing.push({ path: `documents.${t}`, message: `Upload your ${t === 'PAN' ? 'PAN card' : 'Aadhaar'}` });
    }
    if (missing.length) throw Errors.badRequest('KYC_INCOMPLETE', 'Some details are missing', missing);
    await this.prisma.owner.update({ where: { id: o.id }, data: { kycStatus: 'PENDING', kycSubmittedAt: new Date(), kycRejectionReason: null } });
    return (await this.get(userId))!;
  }
}

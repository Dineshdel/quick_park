import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  adminBookingListSchema,
  disputeResolveSchema,
  ownerCommissionSchema,
  paginationSchema,
  payoutCreateSchema,
  payoutPaidSchema,
  reasonSchema,
  refundCreateSchema,
  reportSchema,
  userListSchema,
  userStatusSchema,
} from '@qp/validation';
import { type Response } from 'express';
import { type z } from 'zod';
import { type AuthUser } from '../../shared/auth/auth.types';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { ApiZodBody, ApiZodQuery, ZodBody, ZodQuery } from '../../shared/http/decorators/zod.decorators';
import { AdminOpsService } from './admin-ops.service';

const Id = (n = 'id') => Param(n, new ParseUUIDPipe());
type Out<S extends z.ZodType> = z.output<S>;

@ApiTags('admin: operations')
@ApiBearerAuth()
@Roles('SUPER_ADMIN')
@Controller('admin')
export class AdminOpsController {
  constructor(private readonly ops: AdminOpsService) {}

  @Get('overview')
  overview() {
    return this.ops.overview();
  }

  @Get('approvals')
  approvals() {
    return this.ops.approvals();
  }

  @Get('owners')
  owners() {
    return this.ops.owners();
  }

  /** Streams a private KYC document (admins only). */
  @Get('owners/:id/documents/:docId')
  async doc(@Id() id: string, @Id('docId') docId: string, @Res() res: Response) {
    const { doc, stream } = await this.ops.ownerDocument(id, docId);
    res.setHeader('Content-Type', doc.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.docType.toLowerCase()}-${doc.id.slice(0, 8)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    stream.pipe(res);
  }

  @HttpCode(HttpStatus.OK)
  @Post('owners/:id/approve')
  approveOwner(@CurrentUser() u: AuthUser, @Id() id: string) {
    return this.ops.decideKyc(u.id, id, true);
  }

  @HttpCode(HttpStatus.OK)
  @Post('owners/:id/reject')
  @ApiZodBody(reasonSchema)
  rejectOwner(@CurrentUser() u: AuthUser, @Id() id: string, @ZodBody(reasonSchema) b: Out<typeof reasonSchema>) {
    return this.ops.decideKyc(u.id, id, false, b.reason);
  }

  @Patch('owners/:id/commission')
  @ApiZodBody(ownerCommissionSchema)
  commission(@CurrentUser() u: AuthUser, @Id() id: string, @ZodBody(ownerCommissionSchema) b: Out<typeof ownerCommissionSchema>) {
    return this.ops.setCommission(u.id, id, b.commissionPct);
  }

  @Get('locations')
  locations(@Query('status') status?: string) {
    const ok = ['DRAFT', 'PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'];
    return this.ops.locations(status && ok.includes(status) ? status : undefined);
  }

  @HttpCode(HttpStatus.OK)
  @Post('locations/:id/approve')
  approveLocation(@CurrentUser() u: AuthUser, @Id() id: string) {
    return this.ops.decideLocation(u.id, id, 'approve');
  }

  @HttpCode(HttpStatus.OK)
  @Post('locations/:id/reject')
  @ApiZodBody(reasonSchema)
  rejectLocation(@CurrentUser() u: AuthUser, @Id() id: string, @ZodBody(reasonSchema) b: Out<typeof reasonSchema>) {
    return this.ops.decideLocation(u.id, id, 'reject', b.reason);
  }

  @HttpCode(HttpStatus.OK)
  @Post('locations/:id/suspend')
  @ApiZodBody(reasonSchema)
  suspendLocation(@CurrentUser() u: AuthUser, @Id() id: string, @ZodBody(reasonSchema) b: Out<typeof reasonSchema>) {
    return this.ops.decideLocation(u.id, id, 'suspend', b.reason);
  }

  @HttpCode(HttpStatus.OK)
  @Post('locations/:id/reinstate')
  reinstateLocation(@CurrentUser() u: AuthUser, @Id() id: string) {
    return this.ops.decideLocation(u.id, id, 'reinstate');
  }

  @Get('users')
  @ApiZodQuery(userListSchema)
  users(@ZodQuery(userListSchema) q: Out<typeof userListSchema>) {
    return this.ops.users(q);
  }

  @Patch('users/:id/status')
  @ApiZodBody(userStatusSchema)
  userStatus(@CurrentUser() u: AuthUser, @Id() id: string, @ZodBody(userStatusSchema) b: Out<typeof userStatusSchema>) {
    return this.ops.setUserStatus(u.id, id, b.status);
  }

  @Get('bookings')
  @ApiZodQuery(adminBookingListSchema)
  bookings(@ZodQuery(adminBookingListSchema) q: Out<typeof adminBookingListSchema>) {
    return this.ops.bookings(q);
  }

  @Get('payments')
  @ApiZodQuery(paginationSchema)
  payments(@ZodQuery(paginationSchema) q: Out<typeof paginationSchema>) {
    return this.ops.paymentsList(q.page, q.pageSize);
  }

  @Post('refunds')
  @ApiZodBody(refundCreateSchema)
  refund(@CurrentUser() u: AuthUser, @ZodBody(refundCreateSchema) b: Out<typeof refundCreateSchema>) {
    return this.ops.refund(u.id, b);
  }

  @Get('disputes')
  disputes(@Query('status') status?: string) {
    return this.ops.disputes(status && ['OPEN', 'RESOLVED', 'REJECTED'].includes(status) ? status : undefined);
  }

  @HttpCode(HttpStatus.OK)
  @Post('disputes/:id/resolve')
  @ApiZodBody(disputeResolveSchema)
  resolve(@CurrentUser() u: AuthUser, @Id() id: string, @ZodBody(disputeResolveSchema) b: Out<typeof disputeResolveSchema>) {
    return this.ops.resolveDispute(u.id, id, b);
  }

  @Get('payouts')
  payouts() {
    return this.ops.payouts();
  }

  @Post('payouts')
  @ApiZodBody(payoutCreateSchema)
  createPayout(@CurrentUser() u: AuthUser, @ZodBody(payoutCreateSchema) b: Out<typeof payoutCreateSchema>) {
    return this.ops.createPayout(u.id, b);
  }

  @HttpCode(HttpStatus.OK)
  @Post('payouts/:id/paid')
  @ApiZodBody(payoutPaidSchema)
  payoutPaid(@CurrentUser() u: AuthUser, @Id() id: string, @ZodBody(payoutPaidSchema) b: Out<typeof payoutPaidSchema>) {
    return this.ops.markPayoutPaid(u.id, id, b.reference);
  }

  @Get('reports')
  @ApiZodQuery(reportSchema)
  report(@ZodQuery(reportSchema) q: Out<typeof reportSchema>) {
    return this.ops.report(q);
  }

  @Get('audit-logs')
  @ApiZodQuery(paginationSchema)
  audit(@ZodQuery(paginationSchema) q: Out<typeof paginationSchema>) {
    return this.ops.auditLogs(q.page, q.pageSize);
  }
}

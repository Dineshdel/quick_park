import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

/** The signed-in user's in-app notifications (bell menu). */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.notifications.list(u.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('read-all')
  readAll(@CurrentUser() u: AuthUser) {
    return this.notifications.markRead(u.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/read')
  read(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.notifications.markRead(u.id, id);
  }
}

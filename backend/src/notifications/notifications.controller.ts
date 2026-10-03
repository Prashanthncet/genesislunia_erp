import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { NotificationsService } from './notifications.service';

type ReqWithUser = { user: { sub: string; role: string; branch_id: string } };

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  list(
    @Req() req: ReqWithUser,
    @Query('ref_type') refType?: string,
    @Query('recipient') recipient?: string,
    @Query('channel') channel?: string,
  ) {
    return this.notifications.list(req.user.branch_id, {
      ref_type: refType,
      recipient,
      channel,
    });
  }
}

import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { ALL_ROLES, R, ROLE } from '../auth/roles';
import { AuthUser } from '../common/access';
import { CreateNoticeDto } from './notices.dto';
import { NoticesService } from './notices.service';

type Req_ = { user: AuthUser };

/** Who may post (and list/manage) student notices: the office + leadership, and teaching staff for their own classes. */
const AUTHORS = [...new Set([...R.BROADCAST, ...R.TEACHING])];
const PORTAL = [ROLE.PARENT, ROLE.STUDENT];

@Controller('notices')
@UseGuards(AuthGuard, RolesGuard)
export class NoticesController {
  constructor(private notices: NoticesService) {}

  // ─── Portal (literal routes first) ─────────────────────────

  /** Student: all-students + own class + personal. Parent: the same per child, labelled. Newest first, unexpired. */
  @Get('mine')
  @Roles(...PORTAL)
  mine(@Req() req: Req_) {
    return this.notices.mine(req.user);
  }

  /** Nav badge contract: `{ count }` of unread, unexpired notices for this login (staff always 0). */
  @Get('unread-count')
  @Roles(...ALL_ROLES)
  unreadCount(@Req() req: Req_) {
    return this.notices.unreadCount(req.user);
  }

  /** Classes the caller may address (compose form). */
  @Get('targets')
  @Roles(...AUTHORS)
  targets(@Req() req: Req_) {
    return this.notices.targets(req.user);
  }

  // ─── Staff ─────────────────────────────────────────────────

  @Get()
  @Roles(...AUTHORS)
  list(
    @Req() req: Req_,
    @Query('audience') audience?: string,
    @Query('class_id') classId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.notices.listForStaff(req.user, { audience, class_id: classId, from, to });
  }

  @Post()
  @Roles(...AUTHORS)
  create(@Req() req: Req_, @Body() body: CreateNoticeDto) {
    return this.notices.create(req.user, body);
  }

  @Post(':id/read')
  @Roles(...PORTAL)
  read(@Req() req: Req_, @Param('id') id: string) {
    return this.notices.markRead(req.user, id);
  }

  /** Hide from students now, keep the record (author or leadership). */
  @Post(':id/expire')
  @Roles(...AUTHORS)
  expire(@Req() req: Req_, @Param('id') id: string) {
    return this.notices.expire(req.user, id);
  }

  @Delete(':id')
  @Roles(...AUTHORS)
  remove(@Req() req: Req_, @Param('id') id: string) {
    return this.notices.remove(req.user, id);
  }
}

import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { R, ROLE } from '../auth/roles';
import { assertInBranch, audit, portalStudentIds, ReqWithUser } from '../common/access';
import { PrismaService } from '../prisma/prisma.service';
import { BroadcastDto } from './dto/broadcast.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(AuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private notifications: NotificationsService, private prisma: PrismaService) {}

  /**
   * The school's outbound log. Filters: ref_type + ref_id (per-applicant / per-record
   * history), recipient (substring search), channel, status, q (subject/body/recipient).
   * OTPs/passwords are masked at write time and legacy rows are masked again here.
   */
  @Get()
  @Roles(...R.NOTIFICATION_LOG)
  list(
    @Req() req: ReqWithUser,
    @Query('ref_type') refType?: string,
    @Query('ref_id') refId?: string,
    @Query('recipient') recipient?: string,
    @Query('channel') channel?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.list(req.user.branch_id, {
      ref_type: refType, ref_id: refId, recipient, channel, status, q,
      take: limit ? parseInt(limit, 10) || undefined : undefined,
    });
  }

  /** Parent / student portal: only messages sent to their own contacts or about their own child. */
  @Get('mine')
  @Roles(ROLE.PARENT, ROLE.STUDENT)
  async mine(@Req() req: ReqWithUser) {
    const ids = (await portalStudentIds(this.prisma, req.user)) ?? [];
    const me = await this.prisma.user.findUnique({ where: { id: req.user.sub }, select: { email: true } });
    return this.notifications.forStudents(req.user.branch_id, ids, me ? [me.email] : []);
  }

  /** Staff view of everything sent about one student (all channels, all modules). */
  @Get('student/:id')
  @Roles(...R.NOTIFICATION_LOG)
  async forStudent(@Req() req: ReqWithUser, @Param('id') id: string) {
    await assertInBranch(this.prisma, 'student', id, req.user.branch_id);
    return this.notifications.forStudents(req.user.branch_id, [id]);
  }

  /**
   * Sends an announcement to a resolved audience and logs every attempt.
   * Without NOTIFY_WEBHOOK_URL messages are logged with status `mocked`.
   */
  @Post('broadcast')
  @Roles(...R.BROADCAST)
  async broadcast(@Req() req: ReqWithUser, @Body() body: BroadcastDto) {
    const message = body.body.trim();
    if (!message) throw new BadRequestException('body is required');
    if (body.audience === 'class') {
      if (!body.class_id) throw new BadRequestException('class_id is required when audience is "class"');
      await assertInBranch(this.prisma, 'class', body.class_id, req.user.branch_id);
    }
    if (body.audience === 'custom' && (!body.recipients || body.recipients.length === 0)) {
      throw new BadRequestException('recipients are required when audience is "custom"');
    }
    const result = await this.notifications.broadcast({
      branch_id: req.user.branch_id,
      channel: body.channel,
      subject: body.subject?.trim() || undefined,
      body: message,
      audience: body.audience,
      class_id: body.audience === 'class' ? body.class_id : undefined,
      recipients: body.recipients,
    });
    await audit(this.prisma, req.user, 'CREATE', 'broadcast', body.audience, `${body.channel} -> ${result.dispatched}`);
    return result;
  }
}

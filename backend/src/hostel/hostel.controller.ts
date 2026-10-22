import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { R, ROLE } from '../auth/roles';
import { assertInBranch, audit, currentStaffId, portalStudentIds, ReqWithUser } from '../common/access';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AllocateDto, AutoAllocateDto, BedStatusDto, CreateHostelDto, CreateRoomDto, ROLL_SESSIONS, RollCallDto, UpdateHostelDto, UpdateRoomDto, VisitorDto,
} from './hostel.dto';
import { textContains } from '../common/search';
import { retryOnUniqueRace } from '../common/retry';

/** Who may look at hostel data: the front desk plus school leadership. */
const HOSTEL_READ = [...new Set([...R.HOSTEL_DESK, ...R.LEADERSHIP])];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Tx = Prisma.TransactionClient;

/** Bed labels B{from}..B{from+count-1}. */
export function bedLabels(count: number, from = 1): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => `B${from + i}`);
}

/** B2 < B10 (numeric, not string, order). */
export const bedNo = (label: string) => Number(label.replace(/^\D+/, '')) || 0;
const byBedNo = <T extends { label: string }>(a: T, b: T) => bedNo(a.label) - bedNo(b.label);

/**
 * Makes sure a room's Bed rows exist and every allocation points at one. Rooms created
 * before the Bed table (or by the seed, which predates it) get B1..B{capacity}; allocations
 * without a bed are linked to their labelled bed, else the lowest free active bed.
 * Idempotent — a no-op once the room is consistent. Room.capacity stays = active beds.
 */
export async function syncRoomBeds(tx: Tx, roomId: string) {
  const room = await tx.room.findUnique({
    where: { id: roomId },
    include: { beds: true, allocations: { select: { id: true, bedId: true, bedLabel: true }, orderBy: { allocatedAt: 'asc' } } },
  });
  if (!room) return;
  if (room.beds.length === 0 && room.capacity > 0) {
    for (const label of bedLabels(room.capacity)) {
      await tx.bed.create({ data: { roomId, label } });
    }
  }
  const unlinked = room.allocations.filter((a) => !a.bedId);
  if (!unlinked.length && room.beds.length) return;
  const beds = (await tx.bed.findMany({ where: { roomId }, include: { allocation: { select: { id: true } } } })).sort(byBedNo);
  const taken = new Set(beds.filter((b) => b.allocation).map((b) => b.id));
  const link = async (a: { id: string }, bed: { id: string; label: string }) => {
    await tx.hostelAllocation.update({ where: { id: a.id }, data: { bedId: bed.id, bedLabel: bed.label } });
    taken.add(bed.id);
  };
  // Pass 1: rows that already carry a label keep that bed. Pass 2: the rest take the lowest free bed.
  const rest: typeof unlinked = [];
  for (const a of unlinked) {
    const bed = beds.find((b) => b.label === a.bedLabel && !taken.has(b.id));
    if (bed) await link(a, bed);
    else rest.push(a);
  }
  const labelsInUse = new Set(room.allocations.map((a) => a.bedLabel).filter(Boolean));
  for (const a of rest) {
    const bed = beds.find((b) => b.isActive && !taken.has(b.id) && (!labelsInUse.has(b.label) || b.label === a.bedLabel));
    if (!bed) continue; // over-full legacy room: left unlinked, still listed
    await link(a, bed);
  }
}

/** Busy / conflicting writes from concurrent transactions surface as a clean 409. */
function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code;
  return code === 'P2034' || code === 'P2028' || /database is locked|SQLITE_BUSY|Transaction already closed|Unable to start a transaction/i.test(msg);
}

@Controller('hostel')
@UseGuards(AuthGuard, RolesGuard)
export class HostelController {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  // ─── Hostels ────────────────────────────────────────────────

  @Get()
  @Roles(...HOSTEL_READ)
  async listHostels(@Req() req: ReqWithUser) {
    const hostels = await this.prisma.hostel.findMany({
      where: { branchId: req.user.branch_id },
      include: {
        warden: { select: { id: true, name: true } },
        rooms: { select: { id: true, roomNumber: true, capacity: true, _count: { select: { allocations: true } } }, orderBy: { roomNumber: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
    return hostels.map((h) => {
      const bedCapacity = h.rooms.reduce((s, r) => s + r.capacity, 0);
      const occupied = h.rooms.reduce((s, r) => s + r._count.allocations, 0);
      // `capacity` is the sum of the room capacities; the stored column is only a planning figure.
      return { ...h, planned_capacity: h.capacity, capacity: bedCapacity, occupied, free: Math.max(0, bedCapacity - occupied) };
    });
  }

  @Post()
  @Roles(...R.HOSTEL_ADMIN)
  async createHostel(@Req() req: ReqWithUser, @Body() body: CreateHostelDto) {
    await assertInBranch(this.prisma, 'staff', body.warden_id, req.user.branch_id);
    const h = await this.prisma.hostel.create({
      data: { branchId: req.user.branch_id, name: body.name.trim(), capacity: body.capacity ?? 0, wardenId: body.warden_id || null },
    });
    await audit(this.prisma, req.user, 'CREATE', 'hostel', h.id, h.name);
    return { id: h.id };
  }

  @Put(':id')
  @Roles(...R.HOSTEL_ADMIN)
  async updateHostel(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: UpdateHostelDto) {
    await assertInBranch(this.prisma, 'hostel', id, req.user.branch_id);
    await assertInBranch(this.prisma, 'staff', body.warden_id, req.user.branch_id);
    await this.prisma.hostel.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
        ...(body.warden_id !== undefined ? { wardenId: body.warden_id || null } : {}),
      },
    });
    return { id, success: true };
  }

  @Delete(':id')
  @Roles(...R.HOSTEL_ADMIN)
  async deleteHostel(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.hostel.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { _count: { select: { rooms: true } } },
    });
    if (!existing) throw new NotFoundException('Hostel not found');
    if (existing._count.rooms > 0) throw new ConflictException('Delete the hostel rooms first');
    await this.prisma.hostelRollCall.deleteMany({ where: { hostelId: id, branchId: req.user.branch_id } });
    await this.prisma.hostel.delete({ where: { id } });
    await audit(this.prisma, req.user, 'DELETE', 'hostel', id, existing.name);
    return { success: true };
  }

  // ─── Rooms + bed map ────────────────────────────────────────

  /**
   * Rooms with their bed map, straight from the Bed table: every bed (active or out of
   * service) with who sleeps in it. Rooms that predate the Bed table are healed first.
   */
  @Get('rooms')
  @Roles(...HOSTEL_READ)
  async listRooms(@Req() req: ReqWithUser, @Query('hostel_id') hostelId?: string) {
    const where = { hostel: { branchId: req.user.branch_id }, ...(hostelId ? { hostelId } : {}) };
    const stale = await this.prisma.room.findMany({
      where: { ...where, OR: [{ beds: { none: {} }, capacity: { gt: 0 } }, { allocations: { some: { bedId: null } } }] },
      select: { id: true },
    });
    for (const r of stale) await this.heal(r.id);

    const rooms = await this.prisma.room.findMany({
      where,
      include: {
        hostel: { select: { id: true, name: true } },
        beds: {
          select: {
            id: true, label: true, isActive: true,
            allocation: {
              select: {
                id: true, allocatedAt: true,
                student: { select: { id: true, fullName: true, admissionNo: true, class: { select: { name: true, section: true } } } },
              },
            },
          },
        },
        allocations: {
          select: {
            id: true, bedId: true, bedLabel: true, allocatedAt: true,
            student: { select: { id: true, fullName: true, admissionNo: true, class: { select: { name: true, section: true } } } },
          },
        },
      },
      orderBy: [{ hostelId: 'asc' }, { roomNumber: 'asc' }],
    });
    return rooms.map(({ beds, ...r }) => {
      const active = beds.filter((b) => b.isActive).length;
      return {
        ...r,
        capacity: active,
        occupied: r.allocations.length,
        free: Math.max(0, active - beds.filter((b) => b.isActive && b.allocation).length),
        out_of_service: beds.length - active,
        beds: [...beds].sort(byBedNo).map((b) => ({
          id: b.id,
          label: b.label,
          is_active: b.isActive,
          allocation_id: b.allocation?.id ?? null,
          student: b.allocation?.student ?? null,
        })),
        // Allocations that could not be given a bed (only possible for an over-full legacy room).
        unassigned: r.allocations.filter((a) => !a.bedId).map((a) => ({ allocation_id: a.id, student: a.student })),
      };
    });
  }

  @Post('rooms')
  @Roles(...R.HOSTEL_ADMIN)
  async createRoom(@Req() req: ReqWithUser, @Body() body: CreateRoomDto) {
    await assertInBranch(this.prisma, 'hostel', body.hostel_id, req.user.branch_id);
    const dup = await this.prisma.room.findFirst({ where: { hostelId: body.hostel_id, roomNumber: body.room_number.trim() } });
    if (dup) throw new ConflictException('A room with this number already exists in the hostel');
    const labels = bedLabels(body.capacity);
    const room = await this.prisma.$transaction(async (tx) => {
      const created = await tx.room.create({ data: { hostelId: body.hostel_id, roomNumber: body.room_number.trim(), capacity: body.capacity } });
      for (const label of labels) await tx.bed.create({ data: { roomId: created.id, label } });
      return created;
    });
    await audit(this.prisma, req.user, 'CREATE', 'hostel_room', room.id, `${room.roomNumber} with beds ${labels.join(',')}`);
    return { id: room.id, beds: labels };
  }

  /**
   * Rename and/or resize. Capacity = number of ACTIVE beds: raising it adds new beds
   * (next labels); lowering it takes free beds out of service, highest label first, and
   * is refused (409) when there are not enough free beds.
   */
  @Put('rooms/:id')
  @Roles(...R.HOSTEL_ADMIN)
  async updateRoom(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: UpdateRoomDto) {
    const existing = await this.prisma.room.findFirst({ where: { id, hostel: { branchId: req.user.branch_id } } });
    if (!existing) throw new NotFoundException('Room not found');
    if (body.room_number !== undefined && body.room_number.trim() !== existing.roomNumber) {
      const dup = await this.prisma.room.findFirst({ where: { hostelId: existing.hostelId, roomNumber: body.room_number.trim(), id: { not: id } } });
      if (dup) throw new ConflictException('A room with this number already exists in the hostel');
    }
    const change = await this.withRetry(() => this.prisma.$transaction(async (tx) => {
      await syncRoomBeds(tx, id);
      const beds = (await tx.bed.findMany({ where: { roomId: id }, include: { allocation: { select: { id: true } } } })).sort(byBedNo);
      const active = beds.filter((b) => b.isActive);
      let added: string[] = [];
      let retired: string[] = [];
      if (body.capacity !== undefined && body.capacity !== active.length) {
        if (body.capacity > active.length) {
          const next = beds.length ? Math.max(...beds.map((b) => bedNo(b.label))) + 1 : 1;
          added = bedLabels(body.capacity - active.length, next);
          for (const label of added) await tx.bed.create({ data: { roomId: id, label } });
        } else {
          const need = active.length - body.capacity;
          const free = active.filter((b) => !b.allocation).reverse().slice(0, need);
          if (free.length < need) {
            const occupied = active.length - active.filter((b) => !b.allocation).length;
            throw new ConflictException(`Room has ${occupied} occupied bed(s); capacity cannot go below that — move students first`);
          }
          await tx.bed.updateMany({ where: { id: { in: free.map((b) => b.id) } }, data: { isActive: false } });
          retired = free.map((b) => b.label);
        }
      }
      await tx.room.update({
        where: { id },
        data: {
          ...(body.room_number !== undefined ? { roomNumber: body.room_number.trim() } : {}),
          ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
        },
      });
      return { added, retired };
    }, { maxWait: 10_000, timeout: 15_000 }));
    if (change.added.length || change.retired.length) {
      await audit(this.prisma, req.user, 'UPDATE', 'hostel_room', id,
        `${existing.roomNumber}: capacity → ${body.capacity}${change.added.length ? `, added ${change.added.join(',')}` : ''}${change.retired.length ? `, out of service ${change.retired.join(',')}` : ''}`);
    }
    return { id, success: true, beds_added: change.added, beds_out_of_service: change.retired };
  }

  @Delete('rooms/:id')
  @Roles(...R.HOSTEL_ADMIN)
  async deleteRoom(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.room.findFirst({
      where: { id, hostel: { branchId: req.user.branch_id } },
      include: { _count: { select: { allocations: true } } },
    });
    if (!existing) throw new NotFoundException('Room not found');
    if (existing._count.allocations > 0) throw new ConflictException('Cannot delete a room with students allocated');
    await this.prisma.$transaction([
      this.prisma.bed.deleteMany({ where: { roomId: id } }),
      this.prisma.room.delete({ where: { id } }),
    ]);
    await audit(this.prisma, req.user, 'DELETE', 'hostel_room', id, existing.roomNumber);
    return { success: true };
  }

  /**
   * Take a bed out of service (e.g. broken) or bring it back. Refused while someone is
   * allocated to it. Room capacity follows the number of active beds.
   */
  @Put('beds/:id')
  @Roles(...R.HOSTEL_ADMIN)
  async setBedActive(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: BedStatusDto) {
    const bed = await this.prisma.bed.findFirst({
      where: { id, room: { hostel: { branchId: req.user.branch_id } } },
      include: { room: { select: { roomNumber: true } } },
    });
    if (!bed) throw new NotFoundException('Bed not found');
    const result = await this.withRetry(() => this.prisma.$transaction(async (tx) => {
      const current = await tx.bed.findUnique({ where: { id }, include: { allocation: { select: { id: true } } } });
      if (!current) throw new NotFoundException('Bed not found');
      if (!body.is_active && current.allocation) throw new ConflictException(`Bed ${current.label} is occupied; move the student before taking it out of service`);
      await tx.bed.update({ where: { id }, data: { isActive: body.is_active } });
      const capacity = await tx.bed.count({ where: { roomId: current.roomId, isActive: true } });
      await tx.room.update({ where: { id: current.roomId }, data: { capacity } });
      return { capacity };
    }, { maxWait: 10_000, timeout: 15_000 }));
    await audit(this.prisma, req.user, 'UPDATE', 'hostel_bed', id,
      `${bed.room.roomNumber}/${bed.label} ${body.is_active ? 'back in service' : 'out of service'}${body.reason ? `: ${body.reason}` : ''}`);
    return { id, label: bed.label, is_active: body.is_active, room_capacity: result.capacity };
  }

  // ─── Allocations ────────────────────────────────────────────

  @Get('allocations')
  @Roles(...HOSTEL_READ)
  listAllocations(@Req() req: ReqWithUser, @Query('hostel_id') hostelId?: string) {
    return this.prisma.hostelAllocation.findMany({
      where: { room: { hostel: { branchId: req.user.branch_id }, ...(hostelId ? { hostelId } : {}) } },
      include: {
        student: { select: { id: true, fullName: true, admissionNo: true, class: { select: { name: true, section: true } } } },
        room: { include: { hostel: { select: { id: true, name: true } } } },
        bed: { select: { id: true, label: true } },
      },
      orderBy: { allocatedAt: 'desc' },
    });
  }

  /** Students of this school with no hostel bed yet (allocation picker). */
  @Get('unallocated-students')
  @Roles(...R.HOSTEL_ADMIN)
  unallocated(@Req() req: ReqWithUser, @Query('q') q?: string) {
    return this.prisma.student.findMany({
      where: {
        branchId: req.user.branch_id,
        status: 'Active',
        hostelAllocation: { is: null },
        ...(q ? { OR: [{ fullName: textContains(q) }, { admissionNo: textContains(q) }] } : {}),
      },
      select: { id: true, fullName: true, admissionNo: true, class: { select: { name: true, section: true } } },
      orderBy: { fullName: 'asc' },
      take: 200,
    });
  }

  /** Manual allocation (or move) into a chosen room and, optionally, a chosen bed (bed_id or bed_label). */
  @Post('allocations')
  @Roles(...R.HOSTEL_ADMIN)
  async allocate(@Req() req: ReqWithUser, @Body() body: AllocateDto) {
    await assertInBranch(this.prisma, 'student', body.student_id, req.user.branch_id);
    const room = await this.prisma.room.findFirst({ where: { id: body.room_id, hostel: { branchId: req.user.branch_id } } });
    if (!room) throw new NotFoundException('room not found');
    if (body.bed_id) {
      const bed = await this.prisma.bed.findFirst({ where: { id: body.bed_id, roomId: room.id } });
      if (!bed) throw new NotFoundException('bed not found in this room');
    }
    return this.runAllocation(req, body.student_id, async () => room.id, { id: body.bed_id, label: body.bed_label });
  }

  /** Auto-assign: first free active bed in the least-full room (optionally within one hostel). */
  @Post('allocations/auto')
  @Roles(...R.HOSTEL_ADMIN)
  async autoAllocate(@Req() req: ReqWithUser, @Body() body: AutoAllocateDto) {
    await assertInBranch(this.prisma, 'student', body.student_id, req.user.branch_id);
    await assertInBranch(this.prisma, 'hostel', body.hostel_id, req.user.branch_id);
    return this.runAllocation(req, body.student_id, async (tx) => {
      const rooms = await tx.room.findMany({
        where: { hostel: { branchId: req.user.branch_id }, ...(body.hostel_id ? { hostelId: body.hostel_id } : {}) },
        select: { id: true },
      });
      for (const r of rooms) await syncRoomBeds(tx, r.id);
      const beds = await tx.bed.findMany({
        where: { isActive: true, roomId: { in: rooms.map((r) => r.id) } },
        select: { roomId: true, allocation: { select: { studentId: true } } },
      });
      const stats = new Map<string, { total: number; used: number }>();
      for (const b of beds) {
        const s = stats.get(b.roomId) ?? { total: 0, used: 0 };
        s.total++;
        if (b.allocation && b.allocation.studentId !== body.student_id) s.used++;
        stats.set(b.roomId, s);
      }
      const order = new Map(rooms.map((r, i) => [r.id, i]));
      const candidates = [...stats.entries()]
        .filter(([, s]) => s.used < s.total)
        .sort(([a, x], [b, y]) => x.used / x.total - y.used / y.total || x.used - y.used || order.get(a)! - order.get(b)!);
      if (!candidates.length) throw new ConflictException('All hostel rooms are at capacity');
      return candidates[0][0];
    });
  }

  @Delete('allocations/:id')
  @Roles(...R.HOSTEL_ADMIN)
  async deallocate(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.hostelAllocation.findFirst({
      where: { id, room: { hostel: { branchId: req.user.branch_id } } },
      include: { room: true, student: { select: { fullName: true } } },
    });
    if (!existing) throw new NotFoundException('Allocation not found');
    await this.prisma.hostelAllocation.delete({ where: { id } }); // frees the bed
    await audit(this.prisma, req.user, 'DELETE', 'hostel_allocation', id, `${existing.student.fullName} vacated ${existing.room.roomNumber}/${existing.bedLabel ?? '-'}`);
    return { success: true };
  }

  private async heal(roomId: string) {
    try {
      await this.prisma.$transaction((tx) => syncRoomBeds(tx, roomId), { maxWait: 10_000, timeout: 15_000 });
    } catch (err) {
      // A concurrent request healed it first (unique bed label / bed id) — fine.
      if ((err as { code?: string })?.code !== 'P2002' && !isRetryable(err)) throw err;
    }
  }

  /** Retries SQLite busy errors a few times, then reports a clean 409. */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (!isRetryable(err) || attempt === 3) {
          if (isRetryable(err)) throw new ConflictException('Hostel is busy — please retry');
          throw err;
        }
        await new Promise((r) => setTimeout(r, 25 + Math.random() * 75));
      }
    }
    throw new ConflictException('Hostel is busy — please retry');
  }

  /**
   * One allocation, start to finish, inside a transaction: the room's beds are re-read,
   * a free active bed is picked (or the requested one checked), and the allocation row
   * points at it. HostelAllocation.bedId is UNIQUE, so two concurrent requests for the
   * same bed cannot both commit — the loser re-picks (or gets 409 for an explicit bed).
   * A move deletes the old allocation in the same transaction, freeing the old bed.
   */
  private async runAllocation(req: ReqWithUser, studentId: string, pickRoom: (tx: Tx) => Promise<string>, wanted: { id?: string; label?: string } = {}) {
    const explicit = !!(wanted.id || wanted.label);
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const previous = await tx.hostelAllocation.findUnique({ where: { studentId }, include: { room: true } });
          const roomId = await pickRoom(tx);
          await syncRoomBeds(tx, roomId);
          const room = await tx.room.findFirst({
            where: { id: roomId, hostel: { branchId: req.user.branch_id } },
            include: { beds: { include: { allocation: { select: { studentId: true } } } } },
          });
          if (!room) throw new NotFoundException('room not found');
          const beds = [...room.beds].sort(byBedNo);
          const isFree = (b: (typeof beds)[number]) => !b.allocation || b.allocation.studentId === studentId;

          let bed: (typeof beds)[number] | undefined;
          if (explicit) {
            bed = beds.find((b) => (wanted.id ? b.id === wanted.id : b.label === wanted.label));
            if (!bed) {
              const labels = beds.filter((b) => b.isActive).map((b) => b.label).join(', ');
              throw new BadRequestException(`Room ${room.roomNumber} has no bed ${wanted.label ?? wanted.id}${labels ? ` (beds: ${labels})` : ''}`);
            }
            if (!bed.isActive) throw new ConflictException(`Bed ${bed.label} is out of service`);
            if (!isFree(bed)) throw new ConflictException(`Bed ${bed.label} is already taken`);
          } else {
            bed = beds.find((b) => b.isActive && isFree(b));
            if (!bed) throw new ConflictException('Room is at full capacity');
          }

          if (previous) await tx.hostelAllocation.delete({ where: { id: previous.id } });
          const alloc = await tx.hostelAllocation.create({ data: { studentId, roomId: room.id, bedId: bed.id, bedLabel: bed.label } });
          return { alloc, room, previous, bed };
        }, { maxWait: 10_000, timeout: 15_000 });

        const { alloc, room, previous, bed } = result;
        await audit(
          this.prisma, req.user, previous ? 'UPDATE' : 'CREATE', 'hostel_allocation', alloc.id,
          previous
            ? `moved room ${previous.room.roomNumber}/${previous.bedLabel ?? '-'} → ${room.roomNumber}/${bed.label}`
            : `allocated ${room.roomNumber}/${bed.label}`,
        );
        return {
          id: alloc.id, room_id: room.id, room_number: room.roomNumber, hostel: room.hostelId,
          bed_id: bed.id, bed_label: bed.label, moved: !!previous,
        };
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === 'P2002') {
          // Someone took that bed (or allocated this student) between our read and write.
          if (explicit) throw new ConflictException('That bed was just allocated by someone else — refresh and retry');
        } else if (!isRetryable(err)) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, 25 + Math.random() * 75));
      }
    }
    throw new ConflictException('Hostel is busy — please retry');
  }

  // ─── Parent / student view ──────────────────────────────────

  @Get('my')
  @Roles(ROLE.PARENT, ROLE.STUDENT)
  async mine(@Req() req: ReqWithUser) {
    const ids = (await portalStudentIds(this.prisma, req.user)) ?? [];
    const rows = await this.prisma.student.findMany({
      where: { id: { in: ids }, branchId: req.user.branch_id },
      select: {
        id: true, fullName: true,
        hostelAllocation: {
          select: { bedLabel: true, allocatedAt: true, room: { select: { roomNumber: true, hostel: { select: { name: true, warden: { select: { name: true, phone: true } } } } } } },
        },
        hostelRollCalls: { orderBy: [{ date: 'desc' }, { session: 'asc' }], take: 10, select: { date: true, session: true, status: true } },
      },
    });
    return rows.map((s) => ({
      student_id: s.id,
      student_name: s.fullName,
      hostel: s.hostelAllocation?.room.hostel.name ?? null,
      room: s.hostelAllocation?.room.roomNumber ?? null,
      bed: s.hostelAllocation?.bedLabel ?? null,
      warden: s.hostelAllocation?.room.hostel.warden ?? null,
      allocated_at: s.hostelAllocation?.allocatedAt ?? null,
      recent_roll_calls: s.hostelRollCalls,
    }));
  }

  // ─── Roll-call ──────────────────────────────────────────────

  /**
   * Roster for one hostel + date + session. Saved marks win; otherwise students with an
   * Approved leave or a Checked-Out gate pass covering the date are pre-filled On Leave,
   * everyone else Present.
   */
  @Get('roll-call')
  @Roles(...HOSTEL_READ)
  async roster(@Req() req: ReqWithUser, @Query('hostel_id') hostelId?: string, @Query('date') date?: string, @Query('session') session?: string) {
    if (!hostelId || !date || !DATE_RE.test(date) || !session || !(ROLL_SESSIONS as readonly string[]).includes(session)) {
      throw new BadRequestException('hostel_id, date (YYYY-MM-DD) and session (Morning|Night) are required');
    }
    await assertInBranch(this.prisma, 'hostel', hostelId, req.user.branch_id);
    const allocations = await this.prisma.hostelAllocation.findMany({
      where: { room: { hostelId } },
      include: { room: { select: { roomNumber: true } }, student: { select: { id: true, fullName: true, admissionNo: true, class: { select: { name: true, section: true } } } } },
    });
    const studentIds = allocations.map((a) => a.studentId);
    const [saved, leaves, passes] = await Promise.all([
      this.prisma.hostelRollCall.findMany({ where: { branchId: req.user.branch_id, studentId: { in: studentIds }, date, session } }),
      this.prisma.studentLeave.findMany({
        where: { branchId: req.user.branch_id, studentId: { in: studentIds }, status: 'Approved', startDate: { lte: date }, endDate: { gte: date } },
        select: { studentId: true, leaveType: true },
      }),
      this.prisma.gatePass.findMany({
        where: { branchId: req.user.branch_id, studentId: { in: studentIds }, status: 'Checked Out', outTime: { lte: `${date}T23:59:59` } },
        select: { studentId: true, type: true },
      }),
    ]);
    const savedBy = new Map(saved.map((s) => [s.studentId, s]));
    const leaveBy = new Map(leaves.map((l) => [l.studentId, `Approved leave (${l.leaveType})`]));
    const passBy = new Map(passes.map((p) => [p.studentId, `Checked out on gate pass (${p.type})`]));

    const rows = allocations
      .map((a) => {
        const reason = leaveBy.get(a.studentId) ?? passBy.get(a.studentId) ?? null;
        const s = savedBy.get(a.studentId);
        return {
          student_id: a.studentId,
          student: a.student,
          room: a.room.roomNumber,
          bed: a.bedLabel,
          status: s?.status ?? (reason ? 'On Leave' : 'Present'),
          saved: !!s,
          leave_reason: reason,
          marked_by: s?.markedBy ?? null,
        };
      })
      .sort((x, y) => x.room.localeCompare(y.room) || bedNo(x.bed ?? '') - bedNo(y.bed ?? ''));
    return { hostel_id: hostelId, date, session, already_marked: saved.length > 0, roster: rows };
  }

  @Post('roll-call')
  @Roles(...R.HOSTEL_ADMIN)
  async markRollCall(@Req() req: ReqWithUser, @Body() body: RollCallDto) {
    await assertInBranch(this.prisma, 'hostel', body.hostel_id, req.user.branch_id);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    if (body.date > tomorrow) throw new BadRequestException('Roll-call cannot be marked for a future date');
    const ids = [...new Set(body.entries.map((e) => e.student_id))];
    if (ids.length !== body.entries.length) throw new BadRequestException('Each student may appear once');

    const residents = await this.prisma.hostelAllocation.findMany({
      where: { studentId: { in: ids }, room: { hostelId: body.hostel_id } },
      select: { studentId: true, student: { select: { fullName: true, mobileNumber: true } } },
    });
    if (residents.length !== ids.length) throw new BadRequestException('Every student must be allocated in this hostel');
    const byId = new Map(residents.map((r) => [r.studentId, r.student]));

    const previous = await this.prisma.hostelRollCall.findMany({
      where: { studentId: { in: ids }, date: body.date, session: body.session },
      select: { studentId: true, status: true },
    });
    const prevStatus = new Map(previous.map((p) => [p.studentId, p.status]));
    const markedBy = (await currentStaffId(this.prisma, req.user)) ?? req.user.sub;

    await retryOnUniqueRace(() => this.prisma.$transaction(
      body.entries.map((e) =>
        this.prisma.hostelRollCall.upsert({
          where: { studentId_date_session: { studentId: e.student_id, date: body.date, session: body.session } },
          create: { branchId: req.user.branch_id, hostelId: body.hostel_id, studentId: e.student_id, date: body.date, session: body.session, status: e.status, markedBy },
          update: { status: e.status, markedBy, hostelId: body.hostel_id },
        }),
      ),
    ));

    // Night roll-call absence → SMS the parent, once per change to Absent.
    let notified = 0;
    if (body.session === 'Night') {
      for (const e of body.entries) {
        if (e.status !== 'Absent' || prevStatus.get(e.student_id) === 'Absent') continue;
        const s = byId.get(e.student_id);
        if (!s?.mobileNumber) continue;
        await this.notifications.notify({
          branch_id: req.user.branch_id,
          channel: 'sms',
          recipient: s.mobileNumber,
          body: `Hostel alert: ${s.fullName} was marked ABSENT at night roll-call on ${body.date}. Please contact the warden immediately.`,
          ref_type: 'hostel_roll_call',
          ref_id: e.student_id,
        });
        notified++;
      }
    }
    const counts = body.entries.reduce<Record<string, number>>((m, e) => ({ ...m, [e.status]: (m[e.status] ?? 0) + 1 }), {});
    return { saved: body.entries.length, counts, parents_notified: notified };
  }

  /** History / absentee report: one row per mark in the range, filterable by status. */
  @Get('roll-call/report')
  @Roles(...HOSTEL_READ)
  async rollCallReport(
    @Req() req: ReqWithUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('hostel_id') hostelId?: string,
    @Query('status') status?: string,
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const end = to && DATE_RE.test(to) ? to : today;
    const start = from && DATE_RE.test(from) ? from : new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
    await assertInBranch(this.prisma, 'hostel', hostelId, req.user.branch_id);
    const rows = await this.prisma.hostelRollCall.findMany({
      where: {
        branchId: req.user.branch_id,
        date: { gte: start, lte: end },
        ...(hostelId ? { hostelId } : {}),
        ...(status ? { status } : {}),
      },
      include: { student: { select: { id: true, fullName: true, admissionNo: true } } },
      orderBy: [{ date: 'desc' }, { session: 'asc' }],
      take: 2000,
    });
    const sessions = new Map<string, { date: string; session: string; hostel_id: string; Present: number; Absent: number; 'On Leave': number }>();
    for (const r of rows) {
      const k = `${r.date}|${r.session}|${r.hostelId}`;
      const s = sessions.get(k) ?? { date: r.date, session: r.session, hostel_id: r.hostelId, Present: 0, Absent: 0, 'On Leave': 0 };
      if (r.status in s) (s as Record<string, number | string>)[r.status] = (s[r.status as 'Present'] as number) + 1;
      sessions.set(k, s);
    }
    return { from: start, to: end, summary: [...sessions.values()], rows };
  }

  // ─── Visitor log ────────────────────────────────────────────

  @Get('visitors')
  @Roles(...HOSTEL_READ)
  async listVisitors(@Req() req: ReqWithUser, @Query('date') date?: string, @Query('hostel_id') hostelId?: string) {
    const [rows, hostels] = await Promise.all([
      this.prisma.visitorLog.findMany({
        where: { branchId: req.user.branch_id, ...(date ? { inTime: { startsWith: date } } : {}), ...(hostelId ? { hostelId } : {}) },
        orderBy: { inTime: 'desc' },
        take: 500,
      }),
      this.prisma.hostel.findMany({ where: { branchId: req.user.branch_id }, select: { id: true, name: true } }),
    ]);
    const names = new Map(hostels.map((h) => [h.id, h.name]));
    return rows.map((v) => ({ ...v, hostelName: v.hostelId ? names.get(v.hostelId) ?? null : null }));
  }

  @Post('visitors')
  @Roles(...R.HOSTEL_DESK)
  async addVisitor(@Req() req: ReqWithUser, @Body() body: VisitorDto) {
    await assertInBranch(this.prisma, 'hostel', body.hostel_id, req.user.branch_id);
    const v = await this.prisma.visitorLog.create({
      data: {
        branchId: req.user.branch_id,
        hostelId: body.hostel_id || null,
        visitorName: body.visitor_name.trim(),
        visitorPhone: body.visitor_phone ?? null,
        whomToMeet: body.whom_to_meet.trim(),
        purpose: body.purpose ?? null,
        inTime: new Date().toISOString(),
        passNo: `V-${Date.now().toString().slice(-6)}`,
      },
    });
    return { id: v.id, pass_no: v.passNo };
  }

  @Put('visitors/:id/checkout')
  @Roles(...R.HOSTEL_DESK)
  async checkoutVisitor(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.visitorLog.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Visitor entry not found');
    if (existing.outTime) throw new ConflictException('Visitor already checked out');
    const v = await this.prisma.visitorLog.update({ where: { id }, data: { outTime: new Date().toISOString() } });
    return { id: v.id, out_time: v.outTime, success: true };
  }
}

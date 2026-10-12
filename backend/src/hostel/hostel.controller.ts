import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';

type ReqWithUser = { user: { sub: string; role: string; branch_id: string } };

@Controller('hostel')
@UseGuards(AuthGuard, RolesGuard)
export class HostelController {
  constructor(private prisma: PrismaService) {}

  // ─── Hostels CRUD ───────────────────────────────────────────

  @Get()
  listHostels(@Req() req: ReqWithUser) {
    return this.prisma.hostel.findMany({
      where: { branchId: req.user.branch_id },
      include: { warden: { select: { id: true, name: true } }, rooms: { include: { _count: { select: { allocations: true } } } } },
      orderBy: { name: 'asc' },
    });
  }

  @Post()
  @Roles('super_admin', 'branch_admin')
  async createHostel(@Req() req: ReqWithUser, @Body() body: { name?: string; capacity?: number; warden_id?: string }) {
    if (!body?.name || typeof body?.capacity !== 'number') {
      throw new BadRequestException('name and capacity are required');
    }
    const h = await this.prisma.hostel.create({
      data: {
        branchId: req.user.branch_id,
        name: body.name,
        capacity: body.capacity,
        wardenId: body.warden_id ?? null,
      },
    });
    return { id: h.id };
  }

  @Put(':id')
  @Roles('super_admin', 'branch_admin')
  async updateHostel(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: { name?: string; capacity?: number; warden_id?: string }) {
    const existing = await this.prisma.hostel.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Hostel not found');
    const h = await this.prisma.hostel.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
        ...(body.warden_id !== undefined ? { wardenId: body.warden_id } : {}),
      },
    });
    return { id: h.id, success: true };
  }

  @Delete(':id')
  @Roles('super_admin', 'branch_admin')
  async deleteHostel(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.hostel.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { _count: { select: { rooms: true } } },
    });
    if (!existing) throw new NotFoundException('Hostel not found');
    if (existing._count.rooms > 0) throw new ConflictException('Delete the hostel rooms first');
    await this.prisma.hostel.delete({ where: { id } });
    return { success: true };
  }

  // ─── Rooms CRUD ─────────────────────────────────────────────

  @Get('rooms')
  listRooms(@Req() req: ReqWithUser, @Query('hostel_id') hostelId?: string) {
    return this.prisma.room.findMany({
      where: { hostel: { branchId: req.user.branch_id }, ...(hostelId ? { hostelId } : {}) },
      include: { hostel: { select: { id: true, name: true } }, _count: { select: { allocations: true } } },
      orderBy: { roomNumber: 'asc' },
    });
  }

  @Post('rooms')
  @Roles('super_admin', 'branch_admin')
  async createRoom(@Req() req: ReqWithUser, @Body() body: { hostel_id?: string; room_number?: string; capacity?: number }) {
    if (!body?.hostel_id || !body?.room_number || typeof body?.capacity !== 'number') {
      throw new BadRequestException('hostel_id, room_number and capacity are required');
    }
    const hostel = await this.prisma.hostel.findFirst({
      where: { id: body.hostel_id, branchId: req.user.branch_id },
    });
    if (!hostel) throw new NotFoundException('Hostel not found in this branch');

    const room = await this.prisma.room.create({
      data: { hostelId: hostel.id, roomNumber: body.room_number, capacity: body.capacity },
    });
    return { id: room.id };
  }

  @Put('rooms/:id')
  @Roles('super_admin', 'branch_admin')
  async updateRoom(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: { room_number?: string; capacity?: number }) {
    const existing = await this.prisma.room.findFirst({ where: { id, hostel: { branchId: req.user.branch_id } } });
    if (!existing) throw new NotFoundException('Room not found');
    const room = await this.prisma.room.update({
      where: { id },
      data: {
        ...(body.room_number !== undefined ? { roomNumber: body.room_number } : {}),
        ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
      },
    });
    return { id: room.id, success: true };
  }

  @Delete('rooms/:id')
  @Roles('super_admin', 'branch_admin')
  async deleteRoom(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.room.findFirst({
      where: { id, hostel: { branchId: req.user.branch_id } },
      include: { _count: { select: { allocations: true } } },
    });
    if (!existing) throw new NotFoundException('Room not found');
    if (existing._count.allocations > 0) throw new ConflictException('Cannot delete a room with students allocated');
    await this.prisma.room.delete({ where: { id } });
    return { success: true };
  }

  // ─── Allocations ────────────────────────────────────────────

  @Get('allocations')
  listAllocations(@Req() req: ReqWithUser) {
    return this.prisma.hostelAllocation.findMany({
      where: { room: { hostel: { branchId: req.user.branch_id } } },
      include: {
        student: { select: { id: true, fullName: true, admissionNo: true, class: { select: { name: true, section: true } } } },
        room: { include: { hostel: { select: { id: true, name: true } } } },
      },
      orderBy: { allocatedAt: 'desc' },
    });
  }

  @Post('allocations')
  @Roles('super_admin', 'branch_admin', 'warden')
  async allocate(@Req() req: ReqWithUser, @Body() body: { student_id?: string; room_id?: string }) {
    if (!body?.student_id || !body?.room_id) throw new BadRequestException('student_id and room_id are required');
    const room = await this.prisma.room.findFirst({
      where: { id: body.room_id, hostel: { branchId: req.user.branch_id } },
      include: { _count: { select: { allocations: true } } },
    });
    if (!room) throw new NotFoundException('Room not found');
    if (room._count.allocations >= room.capacity) throw new ConflictException('Room is at full capacity');

    const student = await this.prisma.student.findFirst({ where: { id: body.student_id, branchId: req.user.branch_id } });
    if (!student) throw new NotFoundException('Student not found');

    const existing = await this.prisma.hostelAllocation.findUnique({
      where: { studentId: student.id },
      include: { room: true },
    });
    if (existing) {
      // move: deallocate then allocate new room
      await this.prisma.hostelAllocation.delete({ where: { id: existing.id } });
    }
    const alloc = await this.prisma.hostelAllocation.create({
      data: { studentId: student.id, roomId: room.id },
    });
    if (existing) {
      await this.prisma.auditLog.create({
        data: {
          branchId: req.user.branch_id,
          actorId: req.user.sub,
          action: 'UPDATE',
          entity: 'hostel_allocation',
          entityId: alloc.id,
          detail: `${student.fullName} moved room ${existing.room.roomNumber} → ${room.roomNumber}`,
        },
      });
    }
    return { id: alloc.id };
  }

  @Delete('allocations/:id')
  @Roles('super_admin', 'branch_admin', 'warden')
  async deallocate(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.hostelAllocation.findFirst({
      where: { id, room: { hostel: { branchId: req.user.branch_id } } },
    });
    if (!existing) throw new NotFoundException('Allocation not found');
    await this.prisma.hostelAllocation.delete({ where: { id } });
    return { success: true };
  }

  /** Auto-assign a student to the room with the most free capacity. */
  @Post('allocations/auto')
  @Roles('super_admin', 'branch_admin', 'warden')
  async autoAllocate(@Req() req: ReqWithUser, @Body() body: { student_id?: string }) {
    if (!body?.student_id) throw new BadRequestException('student_id is required');
    const rooms = await this.prisma.room.findMany({
      where: { hostel: { branchId: req.user.branch_id } },
      include: { _count: { select: { allocations: true } } },
      orderBy: { roomNumber: 'asc' },
    });
    const free = rooms.filter((r) => r._count.allocations < r.capacity);
    if (free.length === 0) throw new ConflictException('All hostel rooms are at capacity');
    // pick room with most free beds
    free.sort((a, b) => (b.capacity - b._count.allocations) - (a.capacity - a._count.allocations));
    const room = free[0];
    const existing = await this.prisma.hostelAllocation.findUnique({
      where: { studentId: body.student_id },
      include: { room: true },
    });
    if (existing) await this.prisma.hostelAllocation.delete({ where: { id: existing.id } });
    const alloc = await this.prisma.hostelAllocation.create({
      data: { studentId: body.student_id, roomId: room.id },
    });
    if (existing) {
      await this.prisma.auditLog.create({
        data: {
          branchId: req.user.branch_id,
          actorId: req.user.sub,
          action: 'UPDATE',
          entity: 'hostel_allocation',
          entityId: alloc.id,
          detail: `auto-move room ${existing.room.roomNumber} → ${room.roomNumber}`,
        },
      });
    }
    return { id: alloc.id, room_id: room.id, room_number: room.roomNumber, hostel: room.hostelId };
  }

  // ─── Visitor log ────────────────────────────────────────────

  @Get('visitors')
  listVisitors(@Req() req: ReqWithUser, @Query('date') date?: string) {
    return this.prisma.visitorLog.findMany({
      where: { branchId: req.user.branch_id, ...(date ? { inTime: { contains: date } } : {}) },
      orderBy: { id: 'desc' },
    });
  }

  @Post('visitors')
  @Roles('super_admin', 'branch_admin', 'warden')
  async addVisitor(@Req() req: ReqWithUser, @Body() body: { hostel_id?: string; visitor_name?: string; visitor_phone?: string; whom_to_meet?: string; purpose?: string }) {
    if (!body?.visitor_name || !body?.whom_to_meet) {
      throw new BadRequestException('visitor_name and whom_to_meet are required');
    }
    const v = await this.prisma.visitorLog.create({
      data: {
        branchId: req.user.branch_id,
        hostelId: body.hostel_id ?? null,
        visitorName: body.visitor_name,
        visitorPhone: body.visitor_phone ?? null,
        whomToMeet: body.whom_to_meet,
        purpose: body.purpose ?? null,
        inTime: new Date().toISOString(),
        passNo: `V-${Date.now().toString().slice(-6)}`,
      },
    });
    return { id: v.id, pass_no: v.passNo };
  }

  @Put('visitors/:id/checkout')
  @Roles('super_admin', 'branch_admin', 'warden')
  async checkoutVisitor(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.visitorLog.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Visitor entry not found');
    if (existing.outTime) throw new ConflictException('Visitor already checked out');
    const v = await this.prisma.visitorLog.update({
      where: { id },
      data: { outTime: new Date().toISOString() },
    });
    return { id: v.id, out_time: v.outTime, success: true };
  }
}

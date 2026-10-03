import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

type ReqWithUser = { user: { sub: string; role: string; branch_id: string } };

@Controller('students')
@UseGuards(AuthGuard, RolesGuard)
export class StudentsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(
    @Req() req: ReqWithUser,
    @Query('class_id') classId?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') page = '1',
    @Query('page_size') pageSize = '50',
  ) {
    const where: Record<string, unknown> = { branchId: req.user.branch_id };
    if (classId) where.classId = classId;
    if (status) where.status = status;
    if (q) where.fullName = { contains: q };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        include: { class: { select: { id: true, name: true, section: true } } },
        orderBy: { fullName: 'asc' },
        skip: (pageNum - 1) * size,
        take: size,
      }),
    ]);
    return { total, page: pageNum, page_size: size, data: rows };
  }

  @Get(':id')
  async get(@Req() req: ReqWithUser, @Param('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: {
        class: true,
        attendance: { orderBy: { date: 'desc' }, take: 30 },
        examMarks: { include: { subject: true, exam: true } },
        hostelAllocation: { include: { room: { include: { hostel: true } } } },
        feeInvoices: true,
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    // True aggregate over ALL attendance records (optional date range), not a window.
    const rangeWhere: Record<string, unknown> = { studentId: id };
    if (from || to) {
      rangeWhere.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    }
    const [totalWorking, present] = await Promise.all([
      this.prisma.attendanceRecord.count({ where: rangeWhere }),
      this.prisma.attendanceRecord.count({ where: { ...rangeWhere, status: 'Present' } }),
    ]);
    return {
      ...student,
      attendance_percentage: totalWorking > 0 ? Math.round((present / totalWorking) * 1000) / 10 : null,
      attendance_records_counted: totalWorking,
    };
  }

  @Post()
  @Roles('super_admin', 'branch_admin', 'teacher')
  async create(@Req() req: ReqWithUser, @Body() dto: CreateStudentDto) {
    try {
      const student = await this.prisma.student.create({
        data: {
          branchId: req.user.branch_id,
          admissionNo: dto.admission_no,
          fullName: dto.full_name,
          fatherName: dto.father_name ?? null,
          motherName: dto.mother_name ?? null,
          mobileNumber: dto.mobile_number ?? null,
          email: dto.email ?? null,
          gender: dto.gender,
          classId: dto.class_id,
          rollNo: dto.roll_no ?? null,
          enrollmentDate: dto.enrollment_date ?? null,
        },
      });
      return { id: student.id };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Unique constraint')) {
        throw new ConflictException('Admission number already exists in this branch');
      }
      throw err;
    }
  }

  @Put(':id')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async update(@Req() req: ReqWithUser, @Param('id') id: string, @Body() dto: UpdateStudentDto) {
    const existing = await this.prisma.student.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Student not found');
    try {
      const student = await this.prisma.student.update({
        where: { id },
        data: {
          ...(dto.full_name !== undefined ? { fullName: dto.full_name } : {}),
          ...(dto.father_name !== undefined ? { fatherName: dto.father_name } : {}),
          ...(dto.mother_name !== undefined ? { motherName: dto.mother_name } : {}),
          ...(dto.mobile_number !== undefined ? { mobileNumber: dto.mobile_number } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
          ...(dto.blood_group !== undefined ? { bloodGroup: dto.blood_group } : {}),
          ...(dto.class_id !== undefined ? { classId: dto.class_id } : {}),
          ...(dto.roll_no !== undefined ? { rollNo: dto.roll_no } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.enrollment_date !== undefined ? { enrollmentDate: dto.enrollment_date } : {}),
        },
      });
      return { id: student.id, success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Unique constraint')) {
        throw new ConflictException('Admission number already exists in this branch');
      }
      throw err;
    }
  }

  @Delete(':id')
  @Roles('super_admin', 'branch_admin')
  async remove(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.student.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Student not found');
    await this.prisma.student.delete({ where: { id } });
    return { success: true };
  }

  @Put(':id/status')
  @Roles('super_admin', 'branch_admin')
  async setStatus(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: { status?: string }) {
    if (!body?.status) throw new ForbiddenException('status is required');
    const existing = await this.prisma.student.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Student not found');
    await this.prisma.student.update({ where: { id }, data: { status: body.status } });
    return { success: true, status: body.status };
  }
}

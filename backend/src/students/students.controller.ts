import { Body, ConflictException, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { CreateStudentDto } from './dto/create-student.dto';

@Controller('students')
@UseGuards(AuthGuard)
export class StudentsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(
    @Req() req: { user: { branch_id: string } },
    @Query('class_id') classId?: string,
    @Query('status') status?: string,
  ) {
    const where: Record<string, unknown> = { branchId: req.user.branch_id };
    if (classId) where.classId = classId;
    if (status) where.status = status;

    return this.prisma.student.findMany({
      where,
      include: { class: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'principal', 'branch_admin', 'teacher')
  async create(@Req() req: { user: { branch_id: string } }, @Body() dto: CreateStudentDto) {
    try {
      const student = await this.prisma.student.create({
        data: {
          branchId: req.user.branch_id,
          admissionNo: dto.admission_no,
          fullName: dto.full_name,
          fatherName: dto.father_name ?? null,
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
}

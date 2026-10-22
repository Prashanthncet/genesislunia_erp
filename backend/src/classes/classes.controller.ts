import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { R, ROLE } from '../auth/roles';
import { audit, ReqWithUser } from '../common/access';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassDto, UpdateClassDto } from './dto/class.dto';

/** Class setup: school admins + the principal. Every staff role may read classes. */
const CLASS_WRITE = [...R.ADMINS, ROLE.PRINCIPAL];

@Controller('classes')
@UseGuards(AuthGuard, RolesGuard)
export class ClassesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles(...R.STAFF)
  list(@Req() req: ReqWithUser) {
    return this.prisma.class.findMany({
      where: { branchId: req.user.branch_id },
      include: { _count: { select: { students: true } }, classTeacher: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  @Get(':id')
  @Roles(...R.STAFF)
  async get(@Req() req: ReqWithUser, @Param('id') id: string) {
    const cls = await this.prisma.class.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: {
        classTeacher: { select: { id: true, name: true } },
        students: {
          orderBy: { rollNo: 'asc' },
          select: { id: true, fullName: true, admissionNo: true, rollNo: true, house: true, gender: true, status: true },
        },
      },
    });
    if (!cls) throw new NotFoundException('Class not found');
    return cls;
  }

  @Post()
  @Roles(...CLASS_WRITE)
  async create(@Req() req: ReqWithUser, @Body() body: CreateClassDto) {
    const name = body?.name?.trim();
    if (!name) throw new BadRequestException('name is required');
    const section = body.section?.trim() || null;
    // The schema has no unique index on (branch, name, section), and a nullable
    // column makes one ineffective anyway, so duplicates are rejected here.
    await this.assertUnique(req.user.branch_id, name, section);
    const classTeacherId = await this.checkTeacher(req.user.branch_id, body.class_teacher_id);
    const cls = await this.prisma.class.create({
      data: { branchId: req.user.branch_id, name, section, classTeacherId },
    });
    await audit(this.prisma, req.user, 'CREATE', 'class', cls.id, `${name} ${section ?? ''}`.trim());
    return { id: cls.id };
  }

  @Put(':id')
  @Roles(...CLASS_WRITE)
  async update(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: UpdateClassDto) {
    const existing = await this.prisma.class.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Class not found');
    const name = body.name !== undefined ? body.name.trim() : existing.name;
    const section = body.section !== undefined ? body.section?.trim() || null : existing.section;
    if (!name) throw new BadRequestException('name is required');
    if (name !== existing.name || section !== existing.section) {
      await this.assertUnique(req.user.branch_id, name, section, id);
    }
    const classTeacherId = body.class_teacher_id !== undefined ? await this.checkTeacher(req.user.branch_id, body.class_teacher_id) : undefined;
    const cls = await this.prisma.class.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name } : {}),
        ...(body.section !== undefined ? { section } : {}),
        ...(classTeacherId !== undefined ? { classTeacherId } : {}),
      },
    });
    await audit(this.prisma, req.user, 'UPDATE', 'class', id,
      classTeacherId !== undefined && classTeacherId !== existing.classTeacherId ? `class teacher ${existing.classTeacherId ?? '-'} → ${classTeacherId ?? '-'}` : undefined);
    return { id: cls.id, success: true };
  }

  /** '' / undefined → null; otherwise the id must be an ACTIVE staff member of this school. */
  private async checkTeacher(branchId: string, staffId?: string): Promise<string | null> {
    if (!staffId) return null;
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, branchId }, select: { id: true, isActive: true } });
    if (!staff) throw new NotFoundException('staff not found');
    if (!staff.isActive) throw new BadRequestException('The class teacher must be an active staff member');
    return staff.id;
  }

  /** Rejects a class that would collide with another in the same branch. */
  private async assertUnique(branchId: string, name: string, section: string | null, exceptId?: string) {
    const clash = await this.prisma.class.findFirst({
      where: { branchId, name, section, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (clash) throw new ConflictException('Class already exists in this branch');
  }

  @Delete(':id')
  @Roles(...CLASS_WRITE)
  async remove(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.class.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { _count: { select: { students: true } } },
    });
    if (!existing) throw new NotFoundException('Class not found');
    if (existing._count.students > 0) {
      throw new ConflictException('Cannot delete a class with enrolled students');
    }
    try {
      await this.prisma.class.delete({ where: { id } });
    } catch (err: unknown) {
      // Timetable / fee structures / exams still point at it.
      if (err instanceof Error && /Foreign key constraint/i.test(err.message)) {
        throw new ConflictException('Class is still referenced (timetable, fee structures, exams...); remove those first');
      }
      throw err;
    }
    await audit(this.prisma, req.user, 'DELETE', 'class', id);
    return { success: true };
  }
}

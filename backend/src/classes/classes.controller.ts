import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';

type ReqWithUser = { user: { sub: string; role: string; branch_id: string } };

@Controller('classes')
@UseGuards(AuthGuard, RolesGuard)
export class ClassesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(@Req() req: ReqWithUser) {
    return this.prisma.class.findMany({
      where: { branchId: req.user.branch_id },
      include: { _count: { select: { students: true } } },
      orderBy: { name: 'asc' },
    });
  }

  @Get(':id')
  async get(@Req() req: ReqWithUser, @Param('id') id: string) {
    const cls = await this.prisma.class.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { students: { orderBy: { rollNo: 'asc' } } },
    });
    if (!cls) throw new NotFoundException('Class not found');
    return cls;
  }

  @Post()
  @Roles('super_admin', 'branch_admin')
  async create(@Req() req: ReqWithUser, @Body() body: { name?: string; section?: string }) {
    if (!body?.name) throw new BadRequestException('name is required');
    try {
      const cls = await this.prisma.class.create({
        data: { branchId: req.user.branch_id, name: body.name, section: body.section ?? null },
      });
      return { id: cls.id };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Unique constraint')) throw new ConflictException('Class already exists in this branch');
      throw err;
    }
  }

  @Put(':id')
  @Roles('super_admin', 'branch_admin')
  async update(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: { name?: string; section?: string }) {
    const existing = await this.prisma.class.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Class not found');
    const cls = await this.prisma.class.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.section !== undefined ? { section: body.section } : {}),
      },
    });
    return { id: cls.id, success: true };
  }

  @Delete(':id')
  @Roles('super_admin', 'branch_admin')
  async remove(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.class.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { _count: { select: { students: true } } },
    });
    if (!existing) throw new NotFoundException('Class not found');
    if (existing._count.students > 0) {
      throw new ConflictException('Cannot delete a class with enrolled students');
    }
    await this.prisma.class.delete({ where: { id } });
    return { success: true };
  }
}

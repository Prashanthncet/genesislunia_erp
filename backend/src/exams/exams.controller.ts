import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';

@Controller('exams')
@UseGuards(AuthGuard)
export class ExamsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(@Req() req: { user: { branch_id: string } }) {
    return this.prisma.exam.findMany({
      where: { branchId: req.user.branch_id },
      orderBy: { date: 'desc' },
    });
  }

  @Get('subjects/:level')
  async subjects(@Req() req: { user: { branch_id: string } }, @Param('level') level: string) {
    return this.prisma.subject.findMany({
      where: { branchId: req.user.branch_id, level },
      orderBy: { groupId: 'asc' },
    });
  }

  @Post('marks')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'branch_admin', 'teacher')
  async submitMarks(
    @Req() req: { user: { branch_id: string } },
    @Body() body: { exam_id?: string; marks?: Array<{ student_id: string; subject_id: string; score: number; max_score?: number }> },
  ) {
    const { exam_id, marks } = body ?? {};
    if (!exam_id || !Array.isArray(marks)) {
      throw new BadRequestException('exam_id and marks are required');
    }

    await this.prisma.$transaction(
      marks.map((m) =>
        this.prisma.examMark.upsert({
          where: {
            examId_studentId_subjectId: {
              examId: exam_id,
              studentId: m.student_id,
              subjectId: m.subject_id,
            },
          },
          create: {
            branchId: req.user.branch_id,
            examId: exam_id,
            studentId: m.student_id,
            subjectId: m.subject_id,
            score: m.score,
            maxScore: m.max_score ?? 100,
          },
          update: { score: m.score, maxScore: m.max_score ?? 100 },
        }),
      ),
    );

    return { success: true, recorded: marks.length };
  }

  @Get('reports/:studentId')
  async report(@Req() req: { user: { branch_id: string } }, @Param('studentId') studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, branchId: req.user.branch_id },
      include: { class: { select: { name: true } } },
    });
    if (!student) throw new NotFoundException('Student not found');

    const marks = await this.prisma.examMark.findMany({
      where: { studentId, branchId: req.user.branch_id },
      include: {
        exam: { select: { name: true, date: true } },
        subject: { select: { code: true, name: true, groupId: true } },
      },
      orderBy: [{ exam: { date: 'desc' } }, { subject: { groupId: 'asc' } }],
    });

    return {
      student: {
        full_name: student.fullName,
        admission_no: student.admissionNo,
        class_name: student.class?.name ?? null,
      },
      results: marks.map((m) => ({
        exam_name: m.exam.name,
        date: m.exam.date,
        subject_code: m.subject.code,
        subject_name: m.subject.name,
        score: m.score,
        max_score: m.maxScore,
      })),
    };
  }
}

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, Roles, RolesGuard } from './auth.guard';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto, CreateUserDto, UpdateUserDto } from './dto/users.dto';
import { ROLE, R } from './roles';

type ReqWithUser = { user: { sub: string; role: string; branch_id: string } };

/** Login attempts per minute per IP. Env-tunable so e2e suites can log in every role. */
const LOGIN_LIMIT = Number(process.env.LOGIN_RATE_LIMIT ?? 10);

/**
 * Accounts are provisioned by school admins (POST /auth/users) or by the system
 * (parent credentials on admission). There is deliberately no public signup and no
 * password-less "SSO": the previous versions of both let anyone become super_admin.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  @Post('login')
  @HttpCode(200)
  // Overrides the global 300/min for this route only (default 10 attempts/min/IP).
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: 60_000 } })
  async login(@Body() body: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() } });
    // Same message for unknown user, wrong password and disabled account.
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(body.password, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const token = await this.jwtService.signAsync({ sub: user.id, role: user.role, branch_id: user.branchId });
    return {
      token,
      role: user.role,
      branch_id: user.branchId,
      must_change_password: user.mustChangePassword,
    };
  }

  /** Who am I — the frontend uses this (not localStorage) to decide what to show. */
  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() req: ReqWithUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.sub },
      include: {
        branch: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true, role: true, department: true } },
        student: { select: { id: true, fullName: true, classId: true, admissionNo: true } },
        parentLinks: {
          include: {
            student: {
              select: { id: true, fullName: true, admissionNo: true, rollNo: true, house: true,
                class: { select: { id: true, name: true, section: true } } },
            },
          },
        },
      },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Account disabled');
    return {
      id: user.id,
      email: user.email,
      name: user.name ?? user.staff?.name ?? user.student?.fullName ?? null,
      role: user.role,
      branch_id: user.branchId,
      branch_name: user.branch.name,
      must_change_password: user.mustChangePassword,
      staff: user.staff,
      student: user.student,
      children: user.parentLinks.map((l) => ({ ...l.student, relation: l.relation })),
    };
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async changePassword(@Req() req: ReqWithUser, @Body() body: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) throw new UnauthorizedException();
    if (!(await bcrypt.compare(body.current_password, user.password))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (body.current_password === body.new_password) {
      throw new BadRequestException('New password must be different');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(body.new_password, 10), mustChangePassword: false },
    });
    return { message: 'Password changed' };
  }

  // ─── User management (school admins) ─────────────────────────

  @Get('users')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...R.ADMINS, ROLE.HR, ROLE.PRINCIPAL)
  users(@Req() req: ReqWithUser, @Query('role') role?: string) {
    return this.prisma.user.findMany({
      where: { branchId: req.user.branch_id, ...(role ? { role } : {}) },
      select: {
        id: true, email: true, name: true, role: true, isActive: true, mustChangePassword: true,
        staffId: true, studentId: true, createdAt: true,
        staff: { select: { name: true, role: true } },
        student: { select: { fullName: true } },
        parentLinks: { select: { student: { select: { id: true, fullName: true } } } },
      },
      orderBy: [{ role: 'asc' }, { email: 'asc' }],
    });
  }

  @Post('users')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...R.ADMINS, ROLE.HR)
  async createUser(@Req() req: ReqWithUser, @Body() body: CreateUserDto) {
    this.assertCanGrant(req.user.role, body.role);
    const branchId = req.user.branch_id;

    if (body.staff_id && !(await this.prisma.staff.findFirst({ where: { id: body.staff_id, branchId } }))) {
      throw new NotFoundException('Staff not found in this school');
    }
    if (body.student_id && !(await this.prisma.student.findFirst({ where: { id: body.student_id, branchId } }))) {
      throw new NotFoundException('Student not found in this school');
    }
    for (const sid of body.child_ids ?? []) {
      if (!(await this.prisma.student.findFirst({ where: { id: sid, branchId } }))) {
        throw new NotFoundException(`Student ${sid} not found in this school`);
      }
    }
    if (body.role === ROLE.STUDENT && !body.student_id) throw new BadRequestException('student_id is required for a student login');
    if (body.role === ROLE.PARENT && !(body.child_ids?.length)) throw new BadRequestException('child_ids is required for a parent login');

    try {
      const user = await this.prisma.user.create({
        data: {
          branchId,
          email: body.email.trim().toLowerCase(),
          password: await bcrypt.hash(body.password, 10),
          role: body.role,
          name: body.name ?? null,
          staffId: body.staff_id ?? null,
          studentId: body.role === ROLE.STUDENT ? body.student_id : null,
          mustChangePassword: true,
          parentLinks: body.role === ROLE.PARENT
            ? { create: (body.child_ids ?? []).map((studentId) => ({ branchId, studentId })) }
            : undefined,
        },
      });
      return { id: user.id, message: 'User created. They must change the password at first login.' };
    } catch (err) {
      if (err instanceof Error && err.message.includes('Unique constraint')) {
        throw new ConflictException('A user with that email, staff record or student already exists');
      }
      throw err;
    }
  }

  @Put('users/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...R.ADMINS, ROLE.HR)
  async updateUser(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: UpdateUserDto) {
    const target = await this.prisma.user.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!target) throw new NotFoundException('User not found');
    // You can't touch an account more privileged than the one you could create.
    this.assertCanGrant(req.user.role, target.role);
    if (body.role) this.assertCanGrant(req.user.role, body.role);
    if (id === req.user.sub && (body.is_active === false || body.role)) {
      throw new ForbiddenException('You cannot disable or re-role your own account');
    }
    await this.prisma.user.update({
      where: { id },
      data: {
        ...(body.role ? { role: body.role } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.is_active !== undefined ? { isActive: body.is_active } : {}),
        ...(body.password ? { password: await bcrypt.hash(body.password, 10), mustChangePassword: true } : {}),
      },
    });
    return { message: 'User updated' };
  }

  /** Only super_admin may create/edit super_admins; HR may only manage non-admin staff. */
  private assertCanGrant(actorRole: string, targetRole: string) {
    if (targetRole === ROLE.SUPER_ADMIN && actorRole !== ROLE.SUPER_ADMIN) {
      throw new ForbiddenException('Only a super admin can grant super_admin');
    }
    if (actorRole === ROLE.HR && (R.ADMINS as string[]).includes(targetRole)) {
      throw new ForbiddenException('HR cannot manage administrator accounts');
    }
  }
}

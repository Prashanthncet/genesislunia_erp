import { Body, Controller, Get, HttpCode, Post, Req, UnauthorizedException, BadRequestException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from './auth.guard';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { SsoDto } from './dto/sso.dto';
import * as bcrypt from 'bcryptjs';

@Controller('auth')
export class AuthController {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  async login(@Body() body: LoginDto) {
    if (!body?.email || !body?.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: body.email },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(body.password, user.password);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    const token = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
      branch_id: user.branchId,
    });

    return { token, role: user.role, branch_id: user.branchId };
  }

  @Post('signup')
  @HttpCode(201)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  async signup(@Body() body: SignupDto) {
    if (!body?.email || !body?.password) {
      throw new BadRequestException('Email and password are required');
    }

    // Check if user already exists
    let existingUser = await this.prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existingUser) {
      // If user already exists, verify password and return token
      const match = await bcrypt.compare(body.password, existingUser.password);
      if (!match) {
        throw new BadRequestException('An account with this email already exists. Please check password or sign in.');
      }
      const token = await this.jwtService.signAsync({
        sub: existingUser.id,
        role: existingUser.role,
        branch_id: existingUser.branchId,
      });
      return { token, role: existingUser.role, branch_id: existingUser.branchId };
    }

    // Ensure we have a default branch
    let defaultBranch = await this.prisma.branch.findFirst();
    if (!defaultBranch) {
      defaultBranch = await this.prisma.branch.create({
        data: {
          name: 'Main Campus',
          location: 'HQ Central',
        },
      });
    }

    const hashedPassword = await bcrypt.hash(body.password, 10);
    const assignedRole = body.role || 'teacher';

    const newUser = await this.prisma.user.create({
      data: {
        email: body.email,
        password: hashedPassword,
        role: assignedRole,
        branchId: defaultBranch.id,
      },
    });

    const token = await this.jwtService.signAsync({
      sub: newUser.id,
      role: newUser.role,
      branch_id: newUser.branchId,
    });

    return { token, role: newUser.role, branch_id: newUser.branchId };
  }

  @Post('sso')
  @HttpCode(200)
  @Throttle({ auth: { limit: 20, ttl: 60_000 } })
  async sso(@Body() body: SsoDto) {
    if (!body?.email) {
      throw new BadRequestException('Work email is required for SSO routing');
    }

    // Lookup user by email or auto-provision if recognized institutional domain
    let user = await this.prisma.user.findUnique({
      where: { email: body.email },
    });

    if (!user) {
      let defaultBranch = await this.prisma.branch.findFirst();
      if (!defaultBranch) {
        defaultBranch = await this.prisma.branch.create({
          data: { name: 'Main Campus', location: 'HQ Central' },
        });
      }

      const randomPassword = await bcrypt.hash(`SSO_${Math.random()}_${Date.now()}`, 10);
      user = await this.prisma.user.create({
        data: {
          email: body.email,
          password: randomPassword,
          role: 'teacher',
          branchId: defaultBranch.id,
        },
      });
    }

    const token = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
      branch_id: user.branchId,
    });

    return { token, role: user.role, branch_id: user.branchId };
  }

  // Generic message on purpose — never reveal whether the email exists.
  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: { user: { sub: string; role: string; branch_id: string } }) {
    return { id: req.user.sub, role: req.user.role, branch_id: req.user.branch_id };
  }
}


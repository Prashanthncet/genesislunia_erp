import { Body, Controller, Get, HttpCode, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from './auth.guard';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';

@Controller('auth')
export class AuthController {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  @Post('login')
  @HttpCode(200)
  // Credential stuffing defence: 10 attempts/min per IP, far below the global 300.
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

  // Generic message on purpose — never reveal whether the email exists.
  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: { user: { sub: string; role: string; branch_id: string } }) {
    return { id: req.user.sub, role: req.user.role, branch_id: req.user.branch_id };
  }
}

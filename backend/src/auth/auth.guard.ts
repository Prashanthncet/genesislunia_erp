import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { resolveJwtSecret } from './jwt-secret';
import { PrismaService } from '../prisma/prisma.service';
import { setRequestUser } from '../common/request-context';

export type JwtPayload = { sub: string; role: string; branch_id: string };

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Unauthorized');
    }

    const token = authHeader.split(' ')[1];
    const secret = resolveJwtSecret();

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, { secret });
    } catch {
      throw new UnauthorizedException('Invalid Token');
    }

    // Role and branch come from the database, not the token: disabling an account or
    // changing its role takes effect on the next request instead of after 8 hours.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { role: true, branchId: true, isActive: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Account disabled');
    request.user = { sub: payload.sub, role: user.role, branch_id: user.branchId } satisfies JwtPayload;
    // Every Prisma query for the rest of this request is now scoped to this school
    // (prisma/tenant-extension.ts) on top of the explicit per-query filters.
    setRequestUser({ userId: payload.sub, role: user.role, branchId: user.branchId });

    return true;
  }
}

/** Role-based access guard. Usage: @UseGuards(AuthGuard, RolesGuard) + @Roles('teacher') */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Forbidden: Insufficient privileges');
    }
    return true;
  }
}

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

/** Parse a named cookie value from the raw Cookie header without external middleware. */
export function extractCookieToken(cookieHeader: string | undefined, name = 'erp_token'): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...v] = part.trim().split('=');
    if (k === name && v.length > 0) {
      try {
        return decodeURIComponent(v.join('='));
      } catch {
        return v.join('=');
      }
    }
  }
  return null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] as string | undefined;
    const cookieToken = extractCookieToken(request.headers['cookie'] as string | undefined, 'erp_token');

    let token: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (cookieToken) {
      token = cookieToken;
    }

    if (!token) {
      throw new UnauthorizedException('Unauthorized');
    }

    const secret = resolveJwtSecret();

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, { secret });
    } catch {
      throw new UnauthorizedException('Invalid Token');
    }

    // Track whether the request arrived via the Next.js Server-Side BFF proxy
    const expectedBffSecret = process.env.BFF_SHARED_SECRET ?? 'genesis-bff-internal-s2s';
    if (request.headers['x-bff-secret'] === expectedBffSecret) {
      request.viaBff = true;
    }

    // Role and branch come from the database, not the token: disabling an account or
    // changing its role takes effect on the next request instead of after 8 hours.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { role: true, branchId: true, isActive: true, mustChangePassword: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Account disabled');

    // Forced password change: accounts flagged mustChangePassword may only check who they
    // are (/auth/me) or change their password (/auth/change-password) until resolved.
    if (user.mustChangePassword) {
      const path = (request.originalUrl ?? request.url ?? '').split('?')[0].replace(/\/+$/, '');
      const method = (request.method ?? 'GET').toUpperCase();
      const isAllowed =
        (method === 'GET' &&
          (path.endsWith('/auth/me') ||
            path.endsWith('/me') ||
            path.endsWith('/auth/security-architecture') ||
            path.endsWith('/portal/admission') ||
            path.endsWith('/portal/overview') ||
            path.endsWith('/notices/unread-count'))) ||
        (method === 'POST' &&
          (path.endsWith('/auth/change-password') ||
            path.endsWith('/change-password') ||
            path.endsWith('/auth/verify-access-code')));
      if (!isAllowed) {
        throw new ForbiddenException('Password change required before accessing this resource');
      }
    }

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

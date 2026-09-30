import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('classes')
@UseGuards(AuthGuard)
export class ClassesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.class.findMany({ orderBy: { name: 'asc' } });
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  getUsers() {
    return this.prisma.user.findMany();
  }

  createUser(email: string) {
    return this.prisma.user.create({ data: { email } });
  }
}

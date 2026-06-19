import { Injectable } from '@nestjs/common';
import type { PublicUser } from '@repo/shared';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getDemoUser(): PublicUser {
    return {
      id: '1',
      displayName: 'Ada Lovelace',
      avatarUrl: null,
    };
  }
}

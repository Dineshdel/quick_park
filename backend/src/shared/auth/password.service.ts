import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  // Used when the user doesn't exist so failed logins take about the same time either way.
  private readonly dummyHash = argon2.hash('timing-equaliser-not-a-password', { type: argon2.argon2id });

  hash(password: string) {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash: string | null | undefined, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash ?? (await this.dummyHash), password).then((ok) => ok && !!hash);
    } catch {
      return false;
    }
  }
}

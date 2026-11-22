/**
 * Create the first super admin (super admins can never self-register).
 *   pnpm seed:admin -- --email admin@example.com --name "Ops Admin"
 * Prints a one-time random password; change it after first login.
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { emailSchema, nameSchema } from '@qp/validation';
import { randomBytes } from 'node:crypto';
import { PasswordService } from '../shared/auth/password.service';
import { validateEnv } from '../shared/config/env';
import { PrismaModule } from '../shared/database/prisma.module';
import { PrismaService } from '../shared/database/prisma.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, envFilePath: ['.env', '../.env'] }), PrismaModule],
  providers: [PasswordService],
})
class SeedAdminModule {}

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = emailSchema.parse(arg('email'));
  const name = nameSchema.parse(arg('name') ?? 'Super Admin');
  const app = await NestFactory.createApplicationContext(SeedAdminModule, { logger: ['error'] });
  try {
    const prisma = app.get(PrismaService);
    if (await prisma.user.findUnique({ where: { email } })) {
      console.error(`A user with email ${email} already exists.`);
      process.exitCode = 1;
      return;
    }
    const password = randomBytes(12).toString('base64url');
    await prisma.user.create({
      data: {
        email,
        name,
        role: 'SUPER_ADMIN',
        emailVerifiedAt: new Date(),
        passwordHash: await app.get(PasswordService).hash(password),
      },
    });
    console.log(`Super admin created: ${email}\nTemporary password (shown once): ${password}`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

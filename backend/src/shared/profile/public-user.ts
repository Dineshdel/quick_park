import { type User } from '@prisma/client';

/** The only user shape the API returns to clients. Never includes hashes or tokens. */
export const toPublicUser = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  avatarUrl: u.avatarUrl,
  phone: u.phone,
  emailVerified: u.emailVerifiedAt !== null,
  hasPassword: u.passwordHash !== null,
  createdAt: u.createdAt,
});
export type PublicUser = ReturnType<typeof toPublicUser>;

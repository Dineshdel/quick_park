import { z } from 'zod';
import { SELF_SERVICE_ROLES } from '@qp/types';
import { emailSchema, nameSchema, passwordSchema } from './common';

export const selfServiceRoleSchema = z.enum(SELF_SERVICE_ROLES);

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: selfServiceRoleSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Do not enforce length rules on login; just require something.
  password: z.string().min(1, 'Password is required').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const googleLoginSchema = z.object({ idToken: z.string().min(10).max(4096) });
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;

export const tokenSchema = z.object({ token: z.string().min(16).max(256) });
export type TokenInput = z.infer<typeof tokenSchema>;

export const emailOnlySchema = z.object({ email: emailSchema });
export type EmailOnlyInput = z.infer<typeof emailOnlySchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(16).max(256),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const chooseRoleSchema = z.object({ role: selfServiceRoleSchema });
export type ChooseRoleInput = z.infer<typeof chooseRoleSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(16).max(256),
  name: nameSchema,
  password: passwordSchema,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const adminInviteSchema = z.object({ email: emailSchema });
export type AdminInviteInput = z.infer<typeof adminInviteSchema>;

export const updateProfileSchema = z
  .object({
    name: nameSchema.optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{10,15}$/, 'Enter a valid phone number')
      .nullable()
      .optional(),
    avatarUrl: z.url().max(1024).nullable().optional(),
  })
  .strict();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

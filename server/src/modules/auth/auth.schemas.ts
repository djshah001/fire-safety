import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(200),
});

export const passwordSchema = z.string()
  .min(12, 'Password must contain at least 12 characters.')
  .max(200)
  .refine((value) => /[a-z]/.test(value), 'Password must contain a lowercase letter.')
  .refine((value) => /[A-Z]/.test(value), 'Password must contain an uppercase letter.')
  .refine((value) => /\d/.test(value), 'Password must contain a number.');

export const passwordResetRequestSchema = z.object({
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(32).max(200),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  password: passwordSchema,
});

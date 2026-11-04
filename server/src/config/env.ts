import { config } from 'dotenv';
import { z } from 'zod';

config();

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(5_000),
  APP_ORIGIN: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1).refine(
    (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
    'DATABASE_URL must be a PostgreSQL connection URL.',
  ),
  BUSINESS_TIMEZONE: z.string().min(1).default('Asia/Kolkata'),
  UPLOAD_ROOT: z.string().min(1).default('./uploads'),
  PUPPETEER_EXECUTABLE_PATH: z.string().trim().min(1).optional(),
  PDF_LOGO_PATH: z.string().trim().min(1).optional(),
  PDF_RENDER_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(2),
  PDF_RENDER_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(60_000).default(30_000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(12),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(24 * 60).default(60),
  MAIL_DELIVERY_MODE: z.enum(['disabled', 'local-file', 'smtp']).default('disabled'),
  LOCAL_MAILBOX_ROOT: z.string().min(1).default('./.local/mailbox'),
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  SMTP_USER: z.string().trim().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM: z.email().max(254).optional(),
  MSG91_AUTH_KEY: z.string().trim().min(1).optional(),
  MSG91_WHATSAPP_INTEGRATED_NUMBER: z.string().trim().min(1).optional(),
  MSG91_WHATSAPP_TEMPLATE_NAME: z.string().trim().min(1).default('vendor_onboarding_invitation'),
  BOOTSTRAP_COMPANY_NAME: z.string().min(1).max(160).optional(),
  BOOTSTRAP_BRANCH_NAME: z.string().min(1).max(120).optional(),
  BOOTSTRAP_ADMIN_NAME: z.string().min(2).max(120).optional(),
  BOOTSTRAP_ADMIN_EMAIL: z.email().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).max(200).optional(),
}).superRefine((value, context) => {
  if (value.NODE_ENV === 'production' && value.MAIL_DELIVERY_MODE === 'local-file') {
    context.addIssue({
      code: 'custom',
      path: ['MAIL_DELIVERY_MODE'],
      message: 'local-file mail delivery is not allowed in production.',
    });
  }
  if (value.MAIL_DELIVERY_MODE === 'smtp') {
    if (!value.SMTP_HOST) {
      context.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'SMTP_HOST is required in smtp mail mode.' });
    }
    if (!value.SMTP_FROM) {
      context.addIssue({ code: 'custom', path: ['SMTP_FROM'], message: 'SMTP_FROM is required in smtp mail mode.' });
    }
    if (Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASSWORD)) {
      context.addIssue({
        code: 'custom',
        path: [value.SMTP_USER ? 'SMTP_PASSWORD' : 'SMTP_USER'],
        message: 'SMTP_USER and SMTP_PASSWORD must be configured together.',
      });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = parsed.data;
export type Environment = typeof env;

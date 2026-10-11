import { describe, expect, it } from 'vitest';
import { envSchema } from './env.js';

const baseEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/fire_safety_test',
};

describe('environment validation', () => {
  it('requires the SMTP host and sender when SMTP delivery is enabled', () => {
    const parsed = envSchema.safeParse({ ...baseEnvironment, MAIL_DELIVERY_MODE: 'smtp' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining(['SMTP_HOST', 'SMTP_FROM']),
      );
    }
  });

  it('requires SMTP credentials as a pair and parses secure mode explicitly', () => {
    expect(envSchema.safeParse({
      ...baseEnvironment,
      MAIL_DELIVERY_MODE: 'smtp',
      SMTP_HOST: 'smtp.example.test',
      SMTP_FROM: 'notifications@example.test',
      SMTP_USER: 'mailer',
    }).success).toBe(false);

    const parsed = envSchema.safeParse({
      ...baseEnvironment,
      MAIL_DELIVERY_MODE: 'smtp',
      SMTP_HOST: 'smtp.example.test',
      SMTP_FROM: 'notifications@example.test',
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'secret',
      SMTP_SECURE: 'true',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.SMTP_SECURE).toBe(true);
  });

  it('rejects the local mailbox transport in production', () => {
    const parsed = envSchema.safeParse({
      ...baseEnvironment,
      NODE_ENV: 'production',
      MAIL_DELIVERY_MODE: 'local-file',
    });
    expect(parsed.success).toBe(false);
  });
});

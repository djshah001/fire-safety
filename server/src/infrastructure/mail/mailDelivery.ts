import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createTransport } from 'nodemailer';
import { env } from '../../config/env.js';

export type MailDeliveryMode = 'disabled' | 'local-file' | 'smtp';

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type SmtpSendResult = {
  accepted: string[];
  rejected: string[];
};

export type MailDeliveryOptions = {
  mode?: MailDeliveryMode;
  localMailboxRoot?: string;
  smtpFrom?: string;
  smtpSend?: (message: MailMessage & { from: string; messageId: string }) => Promise<SmtpSendResult>;
};

let smtpTransport: ReturnType<typeof createTransport> | undefined;

function getSmtpTransport() {
  smtpTransport ??= createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    requireTLS: !env.SMTP_SECURE,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    auth: env.SMTP_USER && env.SMTP_PASSWORD
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
    tls: { minVersion: 'TLSv1.2' },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return smtpTransport;
}

async function defaultSmtpSend(message: MailMessage & { from: string; messageId: string }) {
  const result = await getSmtpTransport().sendMail({
    ...message,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return { accepted: result.accepted, rejected: result.rejected };
}

export async function deliverMail(jobId: string, message: MailMessage, options: MailDeliveryOptions = {}) {
  const mode = options.mode ?? env.MAIL_DELIVERY_MODE;
  if (mode === 'disabled') throw new Error('Email provider is not configured.');

  if (mode === 'local-file') {
    const mailboxRoot = resolve(options.localMailboxRoot ?? env.LOCAL_MAILBOX_ROOT);
    await mkdir(mailboxRoot, { recursive: true });
    try {
      await writeFile(resolve(mailboxRoot, `${jobId}.json`), JSON.stringify({
        localOnly: true,
        ...message,
        createdAt: new Date().toISOString(),
      }, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    return;
  }

  const from = options.smtpFrom ?? env.SMTP_FROM;
  if (!from) throw new Error('SMTP sender is not configured.');
  const sender = options.smtpSend ?? defaultSmtpSend;
  const domain = from.slice(from.lastIndexOf('@') + 1);
  const result = await sender({ ...message, from, messageId: `<outbox-${jobId}@${domain}>` });
  const accepted = new Set(result.accepted.map((recipient: string) => recipient.toLowerCase()));
  if (!accepted.has(message.to.toLowerCase())) {
    throw new Error('SMTP server did not accept the intended recipient.');
  }
}

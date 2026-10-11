import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { handleOutboxJob, PermanentJobError, type ClaimedJob } from './outboxWorker.js';

const job: ClaimedJob = {
  id: '00000000-0000-4000-8000-000000000001', companyId: 'company-id', type: 'identity.password_reset_requested',
  payloadVersion: 1,
  payload: {
    userId: '00000000-0000-4000-8000-000000000002',
    email: 'employee@example.test',
    token: 'a'.repeat(48),
  },
  attempts: 1,
  maxAttempts: 5,
};

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => {
    await rm(directory, { recursive: true, force: true });
  }));
});

describe('outbox handlers', () => {
  it('accepts a valid in-app CRM reminder occurrence without claiming external delivery', async () => {
    await expect(handleOutboxJob({
      ...job,
      type: 'crm.reminder_due',
      payload: { occurrenceId: '00000000-0000-4000-8000-000000000099' },
    })).resolves.toBeUndefined();
  });

  it('does not claim password reset delivery when email is unconfigured', async () => {
    await expect(handleOutboxJob(job)).rejects.toEqual(expect.objectContaining({
      message: expect.stringContaining('not configured'),
    }));
    await expect(handleOutboxJob(job)).rejects.toBeInstanceOf(PermanentJobError);
  });

  it('captures reset instructions in the private local test mailbox', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fire-safety-mailbox-'));
    temporaryDirectories.push(directory);
    await handleOutboxJob(job, {
      mailDeliveryMode: 'local-file',
      localMailboxRoot: directory,
      appOrigin: 'http://localhost:5173',
    });
    const message = JSON.parse(await readFile(join(directory, `${job.id}.json`), 'utf8')) as {
      localOnly: boolean; to: string; text: string;
    };
    expect(message).toMatchObject({ localOnly: true, to: 'employee@example.test' });
    expect(message.text).toContain('http://localhost:5173/reset-password?token=');
    await expect(handleOutboxJob(job, {
      mailDeliveryMode: 'local-file',
      localMailboxRoot: directory,
      appOrigin: 'http://localhost:5173',
    })).resolves.toBeUndefined();
  });
});

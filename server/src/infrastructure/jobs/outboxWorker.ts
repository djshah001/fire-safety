import { hostname } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { logger } from '../../core/logger/logger.js';

export type ClaimedJob = {
  id: string;
  companyId: string;
  type: string;
  payloadVersion: number;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
};

export class PermanentJobError extends Error {}

const passwordResetPayloadSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  token: z.string().min(32),
});
const reminderDuePayloadSchema = z.object({ occurrenceId: z.uuid() });

export type OutboxHandlerOptions = {
  mailDeliveryMode?: 'disabled' | 'local-file';
  localMailboxRoot?: string;
  appOrigin?: string;
};

export function createWorkerId() {
  return `${hostname()}:${process.pid}`.slice(0, 100);
}

export async function claimNextJob(pool: Pool, workerId: string): Promise<ClaimedJob | undefined> {
  const result = await pool.query<ClaimedJob>(`
    with candidate as (
      select id
      from outbox_jobs
      where attempts < max_attempts
        and due_at <= now()
        and (status = 'pending' or (status = 'processing' and lease_expires_at < now()))
      order by due_at, created_at
      for update skip locked
      limit 1
    )
    update outbox_jobs as job
    set status = 'processing',
        attempts = job.attempts + 1,
        lease_owner = $1,
        lease_expires_at = now() + interval '60 seconds',
        updated_at = now()
    from candidate
    where job.id = candidate.id
    returning job.id,
      job.company_id as "companyId",
      job.type,
      job.payload_version as "payloadVersion",
      job.payload,
      job.attempts,
      job.max_attempts as "maxAttempts"
  `, [workerId]);
  return result.rows[0];
}

export async function handleOutboxJob(job: ClaimedJob, options: OutboxHandlerOptions = {}) {
  if (job.type === 'crm.reminder_due') {
    reminderDuePayloadSchema.parse(job.payload);
    return;
  }
  if (job.type === 'identity.password_reset_requested') {
    const mode = options.mailDeliveryMode ?? env.MAIL_DELIVERY_MODE;
    if (mode === 'disabled') {
      throw new PermanentJobError('Email provider is not configured; reset instructions were not delivered.');
    }
    const payload = passwordResetPayloadSchema.parse(job.payload);
    const mailboxRoot = resolve(options.localMailboxRoot ?? env.LOCAL_MAILBOX_ROOT);
    await mkdir(mailboxRoot, { recursive: true });
    const resetUrl = new URL('/reset-password', options.appOrigin ?? env.APP_ORIGIN);
    resetUrl.searchParams.set('token', payload.token);
    try {
      await writeFile(resolve(mailboxRoot, `${job.id}.json`), JSON.stringify({
        localOnly: true,
        to: payload.email,
        subject: 'Fire Safety password reset',
        text: `Open this local reset link: ${resetUrl.toString()}`,
        createdAt: new Date().toISOString(),
      }, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    return;
  }
  throw new PermanentJobError(`No handler is registered for job type ${job.type}.`);
}

async function materializeNextReminder(pool: Pool, job: ClaimedJob) {
  if (job.type !== 'crm.reminder_due') return;
  const { occurrenceId } = reminderDuePayloadSchema.parse(job.payload);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await client.query<{ id: string; dueAt: Date }>(`
      with current_reminder as (
        select occurrence.company_id, occurrence.lead_id, occurrence.assignee_user_id,
          occurrence.rule_id, occurrence.due_at, rule.recurrence
        from reminder_occurrences occurrence
        join reminder_rules rule on rule.id = occurrence.rule_id
        where occurrence.id = $1 and occurrence.company_id = $2
          and rule.status = 'active' and rule.recurrence <> 'none'
        for update of rule
      ), next_occurrence as (
        insert into reminder_occurrences (
          company_id, rule_id, lead_id, assignee_user_id, due_at
        )
        select company_id, rule_id, lead_id, assignee_user_id,
          case recurrence
            when 'daily' then due_at + interval '1 day'
            when 'weekly' then due_at + interval '1 week'
            when 'monthly' then due_at + interval '1 month'
          end
        from current_reminder
        on conflict (rule_id, due_at) do nothing
        returning id, due_at as "dueAt"
      )
      select id, "dueAt" from next_occurrence
    `, [occurrenceId, job.companyId]);
    const next = result.rows[0];
    if (next) {
      await client.query(`
        insert into outbox_jobs (company_id, type, payload, dedup_key, due_at)
        values ($1, 'crm.reminder_due', jsonb_build_object('occurrenceId', $2::text), $3, $4)
        on conflict (company_id, type, dedup_key) do nothing
      `, [job.companyId, next.id, `reminder:${next.id}`, next.dueAt]);
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function markCompleted(pool: Pool, jobId: string, workerId: string) {
  await pool.query(`
    update outbox_jobs
    set status = 'completed', completed_at = now(), lease_owner = null,
        lease_expires_at = null, last_error = null, updated_at = now()
    where id = $1 and status = 'processing' and lease_owner = $2
  `, [jobId, workerId]);
}

async function markFailed(pool: Pool, job: ClaimedJob, workerId: string, error: unknown) {
  const message = (error instanceof Error ? error.message : 'Unknown worker failure').slice(0, 2_000);
  const permanent = error instanceof PermanentJobError || job.attempts >= job.maxAttempts;
  const retryDelaySeconds = Math.min(900, 2 ** Math.min(job.attempts, 8) * 5);
  await pool.query(`
    update outbox_jobs
    set status = $3::outbox_job_status,
        due_at = case when $3::outbox_job_status = 'pending' then now() + ($4 * interval '1 second') else due_at end,
        lease_owner = null, lease_expires_at = null, last_error = $5, updated_at = now()
    where id = $1 and status = 'processing' and lease_owner = $2
  `, [job.id, workerId, permanent ? 'failed' : 'pending', retryDelaySeconds, message]);
}

export async function processOneOutboxJob(pool: Pool, workerId: string) {
  const job = await claimNextJob(pool, workerId);
  if (!job) return false;
  try {
    await handleOutboxJob(job);
    await materializeNextReminder(pool, job);
    await markCompleted(pool, job.id, workerId);
    logger.info({ jobId: job.id, jobType: job.type }, 'Outbox job completed');
  } catch (error) {
    await markFailed(pool, job, workerId, error);
    logger.warn({ err: error, jobId: job.id, jobType: job.type }, 'Outbox job did not complete');
  }
  return true;
}

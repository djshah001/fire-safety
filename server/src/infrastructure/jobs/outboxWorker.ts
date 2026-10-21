import { hostname } from 'node:os';
import type { Pool } from 'pg';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { logger } from '../../core/logger/logger.js';
import {
  deliverMail,
  type MailDeliveryMode,
  type MailDeliveryOptions,
} from '../mail/mailDelivery.js';

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
const designDeadlinePayloadSchema = z.object({ jobId: z.uuid(), dueAt: z.iso.datetime({ offset: true }) });

export type OutboxHandlerOptions = Omit<MailDeliveryOptions, 'mode'> & {
  mailDeliveryMode?: MailDeliveryMode;
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
  if (job.type === 'engineering.design_deadline') {
    designDeadlinePayloadSchema.parse(job.payload);
    return;
  }
  if (job.type === 'identity.password_reset_requested') {
    const mode = options.mailDeliveryMode ?? env.MAIL_DELIVERY_MODE;
    if (mode === 'disabled') {
      throw new PermanentJobError('Email provider is not configured; reset instructions were not delivered.');
    }
    const payload = passwordResetPayloadSchema.parse(job.payload);
    const resetUrl = new URL('/reset-password', options.appOrigin ?? env.APP_ORIGIN);
    resetUrl.searchParams.set('token', payload.token);
    await deliverMail(job.id, {
      to: payload.email,
      subject: 'Fire Safety password reset',
      text: `Open this reset link: ${resetUrl.toString()}`,
    }, { ...options, mode });
    return;
  }
  throw new PermanentJobError(`No handler is registered for job type ${job.type}.`);
}

export async function materializeDesignDeadlineNotifications(pool: Pool, job: ClaimedJob) {
  if (job.type !== 'engineering.design_deadline') return;
  const { jobId, dueAt } = designDeadlinePayloadSchema.parse(job.payload);
  await pool.query(`
    insert into notifications (
      company_id, recipient_user_id, type, severity, title, message,
      link, target_type, target_id, dedup_key
    )
    select design.company_id, recipient.user_id, 'engineering.design_overdue',
      'warning'::notification_severity, 'Design task overdue',
      design.title || ' passed its design deadline before first submission.',
      '/engineering/design-jobs/' || design.id::text, 'design_job', design.id,
      'design-overdue:' || design.id::text || ':' || extract(epoch from design.design_due_at)::bigint
    from design_jobs design
    cross join lateral unnest(array[design.designer_user_id, design.design_head_user_id]) as recipient(user_id)
    where design.id = $1 and design.company_id = $2
      and design.designer_completed_at is null
      and design.design_due_at = $3::timestamptz
      and recipient.user_id is not null
    on conflict (company_id, recipient_user_id, dedup_key) do nothing
  `, [jobId, job.companyId, dueAt]);
}

export async function materializeNextReminder(pool: Pool, job: ClaimedJob) {
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

type ReminderMailRow = {
  occurrenceStatus: 'pending' | 'completed' | 'cancelled';
  ruleStatus: 'active' | 'completed' | 'cancelled';
  assigneeStatus: 'active' | 'disabled';
  assigneeName: string;
  assigneeEmail: string;
  title: string;
  timezone: string;
  dueAt: Date;
  leadNumber: string;
  inquiryName: string;
};

export async function deliverReminderEmail(
  pool: Pool,
  job: ClaimedJob,
  options: OutboxHandlerOptions = {},
) {
  const { occurrenceId } = reminderDuePayloadSchema.parse(job.payload);
  const result = await pool.query<ReminderMailRow>(`
    select occurrence.status as "occurrenceStatus", rule.status as "ruleStatus",
      assignee.status as "assigneeStatus", assignee.name as "assigneeName",
      assignee.email as "assigneeEmail", rule.title, rule.timezone,
      occurrence.due_at as "dueAt", lead.lead_number as "leadNumber",
      lead.inquiry_name as "inquiryName"
    from reminder_occurrences occurrence
    join reminder_rules rule on rule.id = occurrence.rule_id
    join leads lead on lead.id = occurrence.lead_id
    join users assignee on assignee.id = occurrence.assignee_user_id
    where occurrence.id = $1 and occurrence.company_id = $2
  `, [occurrenceId, job.companyId]);
  const reminder = result.rows[0];
  if (!reminder) throw new PermanentJobError('Reminder occurrence no longer exists for this company.');
  if (reminder.occurrenceStatus !== 'pending' || reminder.ruleStatus !== 'active') return;
  if (reminder.assigneeStatus !== 'active') {
    throw new PermanentJobError('Reminder assignee is disabled; reassign or cancel the reminder rule.');
  }

  const mode = options.mailDeliveryMode ?? env.MAIL_DELIVERY_MODE;
  if (mode === 'disabled') {
    throw new PermanentJobError('Email provider is not configured; the in-app reminder remains available.');
  }
  const dueAt = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: reminder.timezone,
  }).format(reminder.dueAt);
  const followUpsUrl = new URL('/crm/follow-ups', options.appOrigin ?? env.APP_ORIGIN);
  const subjectTitle = reminder.title.replace(/[\r\n]+/g, ' ');
  await deliverMail(job.id, {
    to: reminder.assigneeEmail,
    subject: `Follow-up due: ${subjectTitle}`,
    text: [
      `Hello ${reminder.assigneeName},`,
      '',
      `Your follow-up “${reminder.title}” is due ${dueAt} (${reminder.timezone}).`,
      `Lead: ${reminder.leadNumber} — ${reminder.inquiryName}`,
      `Open follow-ups: ${followUpsUrl.toString()}`,
    ].join('\n'),
  }, { ...options, mode });
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

export async function processOneOutboxJob(
  pool: Pool,
  workerId: string,
  options: OutboxHandlerOptions = {},
) {
  const job = await claimNextJob(pool, workerId);
  if (!job) return false;
  try {
    await handleOutboxJob(job, options);
    if (job.type === 'crm.reminder_due') {
      // Recurrence is durable before any external call, so a provider outage cannot break the series.
      await materializeNextReminder(pool, job);
      await deliverReminderEmail(pool, job, options);
    }
    if (job.type === 'engineering.design_deadline') {
      await materializeDesignDeadlineNotifications(pool, job);
    }
    await markCompleted(pool, job.id, workerId);
    logger.info({ jobId: job.id, jobType: job.type }, 'Outbox job completed');
  } catch (error) {
    await markFailed(pool, job, workerId, error);
    logger.warn({ err: error, jobId: job.id, jobType: job.type }, 'Outbox job did not complete');
  }
  return true;
}

import type { PoolClient } from 'pg';
import type { AuthenticatedPrincipal } from '../modules/auth/auth.types.js';
import { createAuthRepository } from '../modules/auth/auth.repository.js';
import { QuotationService } from '../modules/engineering/quotation.service.js';
import { db } from '../infrastructure/database/db.js';

export type DemoQuotationCheckpoint = {
  jobId: string;
  revisionId: string;
  target: 'issued' | 'accepted' | 'planned' | 'declined';
};

export async function finishDemoQuotations(client: PoolClient, context: {
  companyId: string; purchaseId: string; salesId: string; adminId: string;
}, checkpoints: DemoQuotationCheckpoint[]) {
  async function principal(userId: string): Promise<AuthenticatedPrincipal> {
    const user = (await client.query<{ name: string; email: string }>(`
      select name, email from users where company_id = $1 and id = $2 and status = 'active'
    `, [context.companyId, userId])).rows[0];
    if (!user) throw new Error('Active demo employee required to initialize quotation checkpoints.');
    return { ...user, companyId: context.companyId, userId, sessionId: 'development-seed', mustChangePassword: false,
      grants: await createAuthRepository(db).listPermissionGrants(userId, context.companyId, new Date()) };
  }
  const purchase = await principal(context.purchaseId);
  const sales = await principal(context.salesId);
  const admin = await principal(context.adminId);
  const service = new QuotationService();
  for (const checkpoint of checkpoints) {
    const initialized = await client.query(`
      select 1 from audit_events where company_id = $1 and target_id = $2 and action = 'development.demo_checkpoint_initialized'
    `, [context.companyId, checkpoint.revisionId]);
    if (initialized.rowCount) continue;
    // Services render/store the real DEMO PDF outside the seed transaction and audit each transition.
    // An interrupted initialization can resume; the marker prevents replaying customer-tested history.
    let row = (await client.query<{ status: string; row_version: number; cash_percentage: string | null }>(`
      select status, row_version, cash_percentage from quotation_revisions where company_id = $1 and id = $2
    `, [context.companyId, checkpoint.revisionId])).rows[0]!;
    const requestId = `demo-checkpoint-${checkpoint.revisionId}`;
    if (row.status === 'approved') {
      const result = await service.issue(purchase, checkpoint.jobId, checkpoint.revisionId, row.row_version, requestId);
      row = { status: result.revision.status, row_version: result.revision.rowVersion, cash_percentage: result.revision.cashPercentage };
    }
    if (row.status === 'issued' && checkpoint.target !== 'issued') {
      const revision = await service.recordCustomerDecision(sales, checkpoint.jobId, checkpoint.revisionId, {
        decision: checkpoint.target === 'declined' ? 'declined' : 'accepted',
        evidenceReference: `Synthetic demo customer response for revision ${checkpoint.revisionId}`,
        notes: 'Local demo only. No real customer approval or purchase order is claimed.', expectedVersion: row.row_version,
      }, requestId);
      row = { status: revision.status, row_version: revision.rowVersion, cash_percentage: revision.cashPercentage };
    }
    if (row.status === 'accepted' && checkpoint.target === 'planned' && row.cash_percentage === null) {
      await service.updatePaymentPlan(admin, checkpoint.jobId, checkpoint.revisionId, {
        cashPercentage: '20', nonCashPercentage: '80', expectedVersion: row.row_version,
      }, requestId);
    }
    await client.query(`
      insert into audit_events (company_id, actor_user_id, action, target_type, target_id, request_id, metadata)
      values ($1, $2, 'development.demo_checkpoint_initialized', 'quotation_revision', $3, $4, $5::jsonb)
    `, [context.companyId, context.adminId, checkpoint.revisionId, requestId, JSON.stringify({ synthetic: true, target: checkpoint.target })]);
  }
}

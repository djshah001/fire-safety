import { sql } from 'drizzle-orm';
import type { AuthenticatedPrincipal } from '../../modules/auth/auth.types.js';

export const isAdministrator = (principal: AuthenticatedPrincipal) => principal.grants.some((grant) =>
  grant.permissionCode === 'system.access.all' && grant.scopeKind === 'company' && grant.scopeId === null);

// Evaluate current role validity in the database, including immediate revocation.
export const administratorScope = (companyId: string, userId: string) => sql<boolean>`exists (
  select 1 from user_role_assignments administrator_assignment
  join roles administrator_role on administrator_role.id = administrator_assignment.role_id
  where administrator_assignment.company_id = ${companyId} and administrator_assignment.user_id = ${userId}
    and administrator_role.company_id = ${companyId} and administrator_role.code = 'system_admin'
    and administrator_role.is_system = true and administrator_role.is_active = true
    and administrator_assignment.valid_from <= now()
    and (administrator_assignment.valid_until is null or administrator_assignment.valid_until > now())
)`;

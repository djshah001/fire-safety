import type { Request } from 'express';

export type PermissionGrant = {
  permissionCode: string;
  scopeKind: 'company' | 'branch' | 'opportunity' | 'design_job' | 'project' | 'warehouse';
  scopeId: string | null;
  source: 'role' | 'direct';
};

export type AuthenticatedPrincipal = {
  sessionId: string;
  userId: string;
  companyId: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
  grants: PermissionGrant[];
};

export type AuthenticatedRequest = Request & { principal: AuthenticatedPrincipal };

export function getPrincipal(request: Request) {
  return (request as AuthenticatedRequest).principal;
}

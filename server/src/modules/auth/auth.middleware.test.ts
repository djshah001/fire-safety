import { describe, expect, it } from 'vitest';
import { hasCompanyPermission, hasExplicitCompanyGrant, hasPermission, isValidCsrfToken } from './auth.middleware.js';
import type { AuthenticatedPrincipal } from './auth.types.js';

const principal: AuthenticatedPrincipal = {
  sessionId: 'session-id',
  userId: 'user-id',
  companyId: 'company-id',
  name: 'Employee',
  email: 'employee@example.test',
  mustChangePassword: false,
  grants: [
    { permissionCode: 'identity.users.read', scopeKind: 'company', scopeId: null, source: 'role' },
    { permissionCode: 'identity.users.manage', scopeKind: 'branch', scopeId: 'branch-id', source: 'role' },
  ],
};

describe('authentication guards', () => {
  it('gives administrator company visibility without broadening ordinary role grants', () => {
    expect(hasExplicitCompanyGrant({ ...principal, grants: [{ permissionCode: 'system.access.all', scopeKind: 'company', scopeId: null, source: 'role' }] }, 'crm.lead.read')).toBe(true);
    expect(hasExplicitCompanyGrant(principal, 'crm.lead.read')).toBe(false);
  });
  it('requires an exact CSRF cookie and header match', () => {
    expect(isValidCsrfToken('same-token', 'same-token')).toBe(true);
    expect(isValidCsrfToken('same-token', 'different-token')).toBe(false);
    expect(isValidCsrfToken(undefined, 'same-token')).toBe(false);
  });

  it('does not treat a branch grant as a company-wide permission', () => {
    expect(hasCompanyPermission(principal, 'identity.users.read')).toBe(true);
    expect(hasCompanyPermission(principal, 'identity.users.manage')).toBe(false);
    expect(hasCompanyPermission(principal, 'finance.read')).toBe(false);
  });

  it('separates an action-bearing role from explicit company-wide record visibility', () => {
    expect(hasPermission(principal, 'identity.users.read')).toBe(true);
    expect(hasExplicitCompanyGrant(principal, 'identity.users.read')).toBe(false);
    expect(hasExplicitCompanyGrant({
      ...principal,
      grants: [{
        permissionCode: 'crm.lead.read',
        scopeKind: 'company',
        scopeId: null,
        source: 'direct',
      }],
    }, 'crm.lead.read')).toBe(true);
  });
});

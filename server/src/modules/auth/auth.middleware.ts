import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { ForbiddenError, UnauthorizedError } from '../../core/errors/appError.js';
import { constantTimeEqual } from '../../core/security/tokens.js';
import { authService } from './auth.service.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { getPrincipal } from './auth.types.js';
import type { AuthenticatedPrincipal } from './auth.types.js';

export const sessionCookieName = 'fs_session';
export const csrfCookieName = 'fs_csrf';

export const cookieOptions = {
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
};

export const requireAuthentication: RequestHandler = async (request, response, next) => {
  try {
    const token = request.cookies?.[sessionCookieName] as string | undefined;
    if (!token) throw new UnauthorizedError();
    (request as AuthenticatedRequest).principal = await authService.authenticateToken(token);
    next();
  } catch (error) {
    response.clearCookie(sessionCookieName, cookieOptions);
    response.clearCookie(csrfCookieName, cookieOptions);
    next(error);
  }
};

export const requireCsrf: RequestHandler = (request, _response, next) => {
  const cookieToken = request.cookies?.[csrfCookieName] as string | undefined;
  const headerToken = request.get('x-csrf-token');
  if (!isValidCsrfToken(cookieToken, headerToken)) {
    next(new ForbiddenError('The CSRF token is missing or invalid.'));
    return;
  }
  next();
};

export function isValidCsrfToken(cookieToken?: string, headerToken?: string) {
  return Boolean(cookieToken && headerToken && constantTimeEqual(cookieToken, headerToken));
}

export function hasCompanyPermission(principal: AuthenticatedPrincipal, permissionCode: string) {
  return principal.grants.some((grant) =>
    grant.permissionCode === permissionCode && grant.scopeKind === 'company' && grant.scopeId === null,
  );
}

export function hasPermission(principal: AuthenticatedPrincipal, permissionCode: string) {
  return principal.grants.some((grant) => grant.permissionCode === permissionCode);
}

export function hasExplicitCompanyGrant(principal: AuthenticatedPrincipal, permissionCode: string) {
  return principal.grants.some((grant) =>
    grant.permissionCode === permissionCode &&
    grant.scopeKind === 'company' &&
    grant.scopeId === null &&
    grant.source === 'direct',
  );
}

export function requirePermission(permissionCode: string): RequestHandler {
  return (request, _response, next) => {
    const principal = getPrincipal(request);
    if (principal.mustChangePassword) {
      next(new ForbiddenError('Change the temporary password before using this feature.'));
      return;
    }
    if (!hasPermission(principal, permissionCode)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}

export function requireCompanyPermission(permissionCode: string): RequestHandler {
  return (request, _response, next) => {
    const principal = getPrincipal(request);
    if (principal.mustChangePassword) {
      next(new ForbiddenError('Change the temporary password before using this feature.'));
      return;
    }
    if (!hasCompanyPermission(principal, permissionCode)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}

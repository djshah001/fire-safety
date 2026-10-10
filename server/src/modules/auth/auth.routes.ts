import { Router } from 'express';
import { env } from '../../config/env.js';
import { getRequestId } from '../../core/http/requestContext.js';
import { sendData } from '../../core/http/response.js';
import { authService, requestMetadata } from './auth.service.js';
import {
  changePasswordSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from './auth.schemas.js';
import {
  cookieOptions,
  csrfCookieName,
  requireAuthentication,
  requireCsrf,
  sessionCookieName,
} from './auth.middleware.js';
import { getPrincipal } from './auth.types.js';

function publicPrincipal(principal: ReturnType<typeof getPrincipal>) {
  return {
    id: principal.userId,
    companyId: principal.companyId,
    name: principal.name,
    email: principal.email,
    mustChangePassword: principal.mustChangePassword,
    permissions: [...new Set(principal.grants.map((grant) => grant.permissionCode))],
  };
}

export function createAuthRouter() {
  const router = Router();

  router.post('/login', async (request, response) => {
    const input = loginSchema.parse(request.body);
    const metadata = requestMetadata(request);
    const result = await authService.login({ ...input, ...metadata }, metadata.requestId);
    response.cookie(sessionCookieName, result.token, {
      ...cookieOptions,
      httpOnly: true,
      maxAge: env.SESSION_TTL_HOURS * 60 * 60 * 1_000,
    });
    response.cookie(csrfCookieName, result.csrfToken, {
      ...cookieOptions,
      httpOnly: false,
      maxAge: env.SESSION_TTL_HOURS * 60 * 60 * 1_000,
    });
    sendData(request, response, { user: publicPrincipal(result.principal) });
  });

  router.get('/me', requireAuthentication, (request, response) => {
    sendData(request, response, { user: publicPrincipal(getPrincipal(request)) });
  });

  router.post('/logout', requireAuthentication, requireCsrf, async (request, response) => {
    await authService.logout(getPrincipal(request), getRequestId(request));
    response.clearCookie(sessionCookieName, cookieOptions);
    response.clearCookie(csrfCookieName, cookieOptions);
    sendData(request, response, { loggedOut: true });
  });

  router.post('/password-reset/request', async (request, response) => {
    const input = passwordResetRequestSchema.parse(request.body);
    await authService.requestPasswordReset(input.email, getRequestId(request));
    sendData(request, response, {
      accepted: true,
      message: 'If the account is active, password reset instructions will be queued.',
    }, 202);
  });

  router.post('/password-reset/confirm', async (request, response) => {
    const input = passwordResetConfirmSchema.parse(request.body);
    await authService.confirmPasswordReset(input.token, input.password, getRequestId(request));
    response.clearCookie(sessionCookieName, cookieOptions);
    response.clearCookie(csrfCookieName, cookieOptions);
    sendData(request, response, { passwordReset: true });
  });

  router.post('/password/change', requireAuthentication, requireCsrf, async (request, response) => {
    const input = changePasswordSchema.parse(request.body);
    await authService.changePassword(
      getPrincipal(request), input.currentPassword, input.password, getRequestId(request),
    );
    response.clearCookie(sessionCookieName, cookieOptions);
    response.clearCookie(csrfCookieName, cookieOptions);
    sendData(request, response, { passwordChanged: true, loginRequired: true });
  });

  return router;
}

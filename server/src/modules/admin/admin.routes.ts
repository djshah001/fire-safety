import { Router } from 'express';
import { getRequestId } from '../../core/http/requestContext.js';
import { sendData } from '../../core/http/response.js';
import { requireAuthentication, requireCompanyPermission, requireCsrf } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import { adminService } from './admin.service.js';
import {
  accessChangeSchema,
  adminPasswordResetSchema,
  createRoleSchema,
  createUserSchema,
  deactivateRoleSchema,
  listRolesQuerySchema,
  listUsersQuerySchema,
  replaceUserRolesSchema,
  roleIdParamsSchema,
  updateRolePermissionsSchema,
  updateRoleSchema,
  userIdParamsSchema,
} from './admin.schemas.js';

function employeeDto(user: {
  id: string;
  employeeCode: string | null;
  name: string;
  email: string;
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
  rowVersion: number;
  lastLoginAt: Date | null;
  disabledAt: Date | null;
  disabledReason: string | null;
  createdAt: Date;
  roles?: Array<{ id: string; code: string; name: string }>;
}) {
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    name: user.name,
    email: user.email,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    rowVersion: user.rowVersion,
    lastLoginAt: user.lastLoginAt,
    disabledAt: user.disabledAt,
    disabledReason: user.disabledReason,
    createdAt: user.createdAt,
    ...(user.roles ? { roles: user.roles } : {}),
  };
}

function roleDto(role: {
  id: string; code: string; name: string; description: string | null; isSystem: boolean;
  isActive: boolean; rowVersion: number; permissionCodes?: string[];
}) {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    isActive: role.isActive,
    rowVersion: role.rowVersion,
    permissionCodes: role.permissionCodes ?? [],
  };
}

export function createAdminRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/users', requireCompanyPermission('identity.users.read'), async (request, response) => {
    const query = listUsersQuerySchema.parse(request.query);
    const result = await adminService.listUsers(getPrincipal(request), query);
    sendData(request, response, result);
  });

  router.get('/roles', requireCompanyPermission('identity.roles.manage'), async (request, response) => {
    const query = listRolesQuerySchema.parse(request.query);
    const items = await adminService.listRoles(getPrincipal(request), query.includeInactive);
    sendData(request, response, { items: items.map(roleDto) });
  });

  router.get('/permissions', requireCompanyPermission('identity.roles.manage'), async (request, response) => {
    sendData(request, response, { items: await adminService.listPermissions() });
  });

  router.post('/roles', requireCsrf, requireCompanyPermission('identity.roles.manage'), async (request, response) => {
    const role = await adminService.createRole(
      getPrincipal(request), createRoleSchema.parse(request.body), getRequestId(request),
    );
    sendData(request, response, { role: roleDto(role) }, 201);
  });

  router.put('/roles/:roleId', requireCsrf, requireCompanyPermission('identity.roles.manage'), async (request, response) => {
    const { roleId } = roleIdParamsSchema.parse(request.params);
    const role = await adminService.updateRole(
      getPrincipal(request), roleId, updateRoleSchema.parse(request.body), getRequestId(request),
    );
    sendData(request, response, { role: roleDto(role) });
  });

  router.put('/roles/:roleId/permissions', requireCsrf, requireCompanyPermission('identity.roles.manage'), async (request, response) => {
    const { roleId } = roleIdParamsSchema.parse(request.params);
    const role = await adminService.updateRolePermissions(
      getPrincipal(request), roleId, updateRolePermissionsSchema.parse(request.body), getRequestId(request),
    );
    sendData(request, response, { role: roleDto(role) });
  });

  router.post('/roles/:roleId/deactivate', requireCsrf, requireCompanyPermission('identity.roles.manage'), async (request, response) => {
    const { roleId } = roleIdParamsSchema.parse(request.params);
    const input = deactivateRoleSchema.parse(request.body);
    const role = await adminService.deactivateRole(
      getPrincipal(request), roleId, input.expectedVersion, input.reason, getRequestId(request),
    );
    sendData(request, response, { role: roleDto(role) });
  });

  router.post('/users', requireCsrf, requireCompanyPermission('identity.users.manage'), async (request, response) => {
    const input = createUserSchema.parse(request.body);
    const user = await adminService.createUser(getPrincipal(request), input, getRequestId(request));
    sendData(request, response, { user: employeeDto(user) }, 201);
  });

  router.post('/users/:userId/disable', requireCsrf, requireCompanyPermission('identity.users.manage'), async (request, response) => {
    const { userId } = userIdParamsSchema.parse(request.params);
    const input = accessChangeSchema.parse(request.body);
    const user = await adminService.disableUser(
      getPrincipal(request), userId, input.rowVersion, input.reason, getRequestId(request),
    );
    sendData(request, response, { user: employeeDto(user) });
  });

  router.post('/users/:userId/enable', requireCsrf, requireCompanyPermission('identity.users.manage'), async (request, response) => {
    const { userId } = userIdParamsSchema.parse(request.params);
    const input = accessChangeSchema.parse(request.body);
    const user = await adminService.enableUser(
      getPrincipal(request), userId, input.rowVersion, input.reason, getRequestId(request),
    );
    sendData(request, response, { user: employeeDto(user) });
  });

  router.post('/users/:userId/reset-password', requireCsrf, requireCompanyPermission('identity.users.manage'), async (request, response) => {
    const { userId } = userIdParamsSchema.parse(request.params);
    const input = adminPasswordResetSchema.parse(request.body);
    const user = await adminService.resetUserPassword(
      getPrincipal(request), userId, input, getRequestId(request),
    );
    sendData(request, response, { user: employeeDto(user) });
  });

  router.put(
    '/users/:userId/roles',
    requireCsrf,
    requireCompanyPermission('identity.users.manage'),
    requireCompanyPermission('identity.roles.manage'),
    async (request, response) => {
      const { userId } = userIdParamsSchema.parse(request.params);
      const user = await adminService.replaceUserRoles(
        getPrincipal(request), userId, replaceUserRolesSchema.parse(request.body), getRequestId(request),
      );
      sendData(request, response, { user: employeeDto(user) });
    },
  );

  return router;
}

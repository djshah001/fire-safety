import { describe, expect, it } from 'vitest';
import {
  managementPermissionCodes,
  permissionCatalog,
  projectManagerPermissionCodes,
  purchaseExecutivePermissionCodes,
  purchaseManagerPermissionCodes,
  receiverPermissionCodes,
  siteEngineerPermissionCodes,
  storekeeperPermissionCodes,
} from './permissions.js';

describe('inventory & procurement role permission boundaries', () => {
  it('defines all six new inventory workflow permissions in permissionCatalog', () => {
    expect(permissionCatalog['inventory.threshold.manage']).toBeDefined();
    expect(permissionCatalog['inventory.request.create']).toBeDefined();
    expect(permissionCatalog['inventory.dispatch.execute']).toBeDefined();
    expect(permissionCatalog['inventory.pod.verify']).toBeDefined();
    expect(permissionCatalog['inventory.discrepancy.resolve']).toBeDefined();
    expect(permissionCatalog['inventory.replenishment.request']).toBeDefined();
  });

  it('enforces zero PO or requisition write permissions for storekeeper, receiver, and site_engineer', () => {
    const forbiddenWritePrefixes = [
      'procurement.requisition.',
      'procurement.rfq.',
      'procurement.offer.',
      'procurement.comparison.',
      'procurement.purchase_order.create',
      'procurement.purchase_order.approve',
      'procurement.purchase_order.issue',
      'procurement.purchase_order.amend',
    ];

    for (const [roleName, perms] of [
      ['storekeeper', storekeeperPermissionCodes],
      ['receiver', receiverPermissionCodes],
      ['site_engineer', siteEngineerPermissionCodes],
    ] as const) {
      for (const perm of perms) {
        const hasForbidden = forbiddenWritePrefixes.some((prefix) => perm.startsWith(prefix));
        expect(hasForbidden, `${roleName} must not have ${perm}`).toBe(false);
      }
    }
  });

  it('grants expected inventory & procurement boundary permissions', () => {
    expect(purchaseExecutivePermissionCodes).toContain('inventory.stock.read');
    expect(purchaseExecutivePermissionCodes).toContain('inventory.request.create');

    expect(purchaseManagerPermissionCodes).toContain('inventory.stock.read');
    expect(purchaseManagerPermissionCodes).toContain('inventory.threshold.manage');
    expect(purchaseManagerPermissionCodes).toContain('inventory.request.create');
    expect(purchaseManagerPermissionCodes).toContain('inventory.discrepancy.resolve');

    expect(storekeeperPermissionCodes).toContain('inventory.stock.read');
    expect(storekeeperPermissionCodes).toContain('inventory.threshold.manage');
    expect(storekeeperPermissionCodes).toContain('inventory.dispatch.execute');
    expect(storekeeperPermissionCodes).toContain('inventory.replenishment.request');

    expect(siteEngineerPermissionCodes).toContain('inventory.stock.read');
    expect(siteEngineerPermissionCodes).toContain('inventory.pod.verify');

    expect(projectManagerPermissionCodes).toContain('inventory.pod.verify');
    expect(projectManagerPermissionCodes).toContain('inventory.discrepancy.resolve');
    expect(managementPermissionCodes).toContain('inventory.discrepancy.resolve');
  });
});

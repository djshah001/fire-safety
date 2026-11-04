import { describe, expect, it } from 'vitest';
import {
  createVendorInvitationSchema,
  itemCreateSchema,
  masterListQuerySchema,
  vendorBankAccountInputSchema,
  vendorCreateSchema,
  vendorPriceListCreateSchema,
} from './masters.schemas.js';

describe('master request validation', () => {
  it('normalizes codes and bounds server-side pagination', () => {
    expect(itemCreateSchema.parse({
      code: 'sd-001',
      name: 'Smoke detector',
      familyId: '00000000-0000-4000-8000-000000000004',
      categoryId: '00000000-0000-4000-8000-000000000001',
      unitId: '00000000-0000-4000-8000-000000000002',
      brandIds: ['00000000-0000-4000-8000-000000000003'],
    }).code).toBe('SD-001');
    expect(() => masterListQuerySchema.parse({ pageSize: 501 })).toThrow();
    expect(() => masterListQuerySchema.parse({ sort: 'taxIdentifier' })).toThrow();
  });

  it('validates vendor registration fields and auto-code compatibility', () => {
    // Valid vendor registration with all sections
    const parsed = vendorCreateSchema.parse({
      displayName: 'Flame Safe Technologies',
      tradeName: 'FlameSafe',
      vendorType: 'manufacturer',
      supplierCategories: ['Fire Alarms', 'Sensors'],
      primaryContact: {
        name: 'Darshan Shah',
        phone: '+91 98765 43210',
        email: 'darshan@example.com',
        jobTitle: 'Sales Director',
      },
      addressLine1: 'Plot 42, GIDC Industrial Estate',
      city: 'Ahmedabad',
      state: 'Gujarat',
      postalCode: '382445',
      country: 'India',
      gstStatus: 'registered',
      gstin: '24ABCDE1234F1Z5',
      legalName: 'Flame Safe Technologies Pvt Ltd',
      pan: 'ABCDE1234F',
      bankAccounts: [{
        accountHolderName: 'Flame Safe Technologies Pvt Ltd',
        accountNumber: '123456789012',
        confirmAccountNumber: '123456789012',
        ifscCode: 'SBIN0001234',
        bankName: 'State Bank of India',
        branch: 'Ahmedabad Main',
      }],
    });

    expect(parsed.displayName).toBe('Flame Safe Technologies');
    expect(parsed.vendorType).toBe('manufacturer');
    expect(parsed.gstStatus).toBe('registered');
    expect(parsed.gstin).toBe('24ABCDE1234F1Z5');
    expect(parsed.bankAccounts[0]?.ifscCode).toBe('SBIN0001234');
  });

  it('enforces GSTIN, legal name, and PAN rules when GST registered', () => {
    // Registered but missing legal name
    expect(() => vendorCreateSchema.parse({
      displayName: 'Test Vendor',
      primaryContact: { name: 'Ravi', phone: '9876543210' },
      gstStatus: 'registered',
      gstin: '24ABCDE1234F1Z5',
    })).toThrow('Registered legal name is required when GST registered.');

    // Registered with invalid GSTIN
    expect(() => vendorCreateSchema.parse({
      displayName: 'Test Vendor',
      legalName: 'Test Legal',
      primaryContact: { name: 'Ravi', phone: '9876543210' },
      gstStatus: 'registered',
      gstin: 'INVALID_GSTIN',
    })).toThrow('Provide a valid 15-character GSTIN');

    // Invalid PAN format
    expect(() => vendorCreateSchema.parse({
      displayName: 'Test Vendor',
      primaryContact: { name: 'Ravi', phone: '9876543210' },
      pan: 'INVALID_PAN',
    })).toThrow('Provide a valid 10-character PAN');
  });

  it('validates bank account matching and IFSC format', () => {
    // Mismatched account numbers
    expect(() => vendorBankAccountInputSchema.parse({
      accountHolderName: 'Test Holder',
      accountNumber: '1122334455',
      confirmAccountNumber: '9988776655',
      ifscCode: 'HDFC0000123',
      bankName: 'HDFC Bank',
    })).toThrow('Account numbers do not match.');

    // Invalid IFSC
    expect(() => vendorBankAccountInputSchema.parse({
      accountHolderName: 'Test Holder',
      accountNumber: '1122334455',
      confirmAccountNumber: '1122334455',
      ifscCode: 'INVALID',
      bankName: 'HDFC Bank',
    })).toThrow('Enter a valid 11-character IFSC code');
  });

  it('validates vendor price list and WhatsApp invitation inputs', () => {
    const priceList = vendorPriceListCreateSchema.parse({
      vendorProductCode: 'SKU-001',
      vendorProductName: 'Photoelectric Smoke Detector',
      unitRate: '1250.5000',
      currency: 'INR',
      effectiveFrom: '2026-11-01',
      leadTimeDays: 7,
    });
    expect(priceList.unitRate).toBe('1250.5000');

    const invitation = createVendorInvitationSchema.parse({
      whatsappNumber: '+91 98765 43210',
      contactName: 'Nisha Shah',
      companyName: 'SafeGuard Supplies',
      validDays: 14,
    });
    expect(invitation.validDays).toBe(14);
  });
});

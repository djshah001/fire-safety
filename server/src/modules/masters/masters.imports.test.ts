import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildMasterImportTemplate, readMasterImportWorkbook } from './masters.imports.js';
import { commitMasterImportSchema, masterImportTypeParamsSchema } from './masters.schemas.js';

describe('masters import workbook and validation', () => {
  it('generates item and vendor downloadable templates with frozen headers', async () => {
    const itemBuffer = await buildMasterImportTemplate('items');
    expect(itemBuffer).toBeInstanceOf(Buffer);
    expect(itemBuffer.length).toBeGreaterThan(1000);

    const itemWb = new ExcelJS.Workbook();
    await itemWb.xlsx.load(itemBuffer as any);
    const itemSheet = itemWb.getWorksheet('Items');
    expect(itemSheet).toBeDefined();
    expect(itemSheet?.views[0]?.state).toBe('frozen');
    expect(itemSheet?.getRow(1).getCell(1).value).toBe('code');
    expect(itemSheet?.getRow(1).getCell(2).value).toBe('name');
    expect(itemSheet?.getRow(1).getCell(3).value).toBe('category');
    expect(itemSheet?.getRow(1).getCell(4).value).toBe('unit');

    const vendorBuffer = await buildMasterImportTemplate('vendors');
    expect(vendorBuffer).toBeInstanceOf(Buffer);
    const vendorWb = new ExcelJS.Workbook();
    await vendorWb.xlsx.load(vendorBuffer as any);
    const vendorSheet = vendorWb.getWorksheet('Vendors');
    expect(vendorSheet).toBeDefined();
    expect(vendorSheet?.views[0]?.state).toBe('frozen');
    expect(vendorSheet?.getRow(1).getCell(1).value).toBe('code');
    expect(vendorSheet?.getRow(1).getCell(2).value).toBe('display_name');
  });

  it('reads item rows and rejects formula injection', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'master-import-test-'));
    const filePath = path.join(tempDir, 'test-items.xlsx');

    try {
      // 1. Create a valid workbook
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Items');
      ws.addRow(['code', 'name', 'category', 'unit', 'family', 'costing_brand', 'model', 'specification', 'initial_rate']);
      ws.addRow(['FA-001', 'Smoke detector optical', 'FIRE_ALARM', 'NOS', 'DETECTORS', 'SCHNEIDER', 'SD-100', 'Optical detector', '1250.00']);
      await wb.xlsx.writeFile(filePath);

      const rows = await readMasterImportWorkbook('items', filePath);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.rowNumber).toBe(2);
      expect(rows[0]?.payload.code).toBe('FA-001');
      expect(rows[0]?.payload.name).toBe('Smoke detector optical');
      expect(rows[0]?.payload.category).toBe('FIRE_ALARM');
      expect(rows[0]?.payload.unit).toBe('NOS');
      expect(rows[0]?.payload.initial_rate).toBe('1250.00');

      // 2. Inject a formula
      const formulaWb = new ExcelJS.Workbook();
      const formulaWs = formulaWb.addWorksheet('Items');
      formulaWs.addRow(['code', 'name', 'category', 'unit', 'family', 'costing_brand', 'model', 'specification', 'initial_rate']);
      const formulaRow = formulaWs.addRow(['FA-002', 'Smoke detector 2', 'FIRE_ALARM', 'NOS', '', '', '', '', '']);
      formulaRow.getCell(1).value = { formula: '1+1', result: 2 };
      await formulaWb.xlsx.writeFile(filePath);

      await expect(readMasterImportWorkbook('items', filePath)).rejects.toThrow(/Formula values are not allowed/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('validates import route schemas', () => {
    expect(masterImportTypeParamsSchema.parse({ type: 'items' })).toEqual({ type: 'items' });
    expect(masterImportTypeParamsSchema.parse({ type: 'vendors' })).toEqual({ type: 'vendors' });
    expect(() => masterImportTypeParamsSchema.parse({ type: 'customers' })).toThrow();

    expect(commitMasterImportSchema.parse({ expectedVersion: 1 })).toEqual({ expectedVersion: 1 });
    expect(commitMasterImportSchema.parse({ expectedVersion: '2' })).toEqual({ expectedVersion: 2 });
    expect(() => commitMasterImportSchema.parse({ expectedVersion: 0 })).toThrow();
    expect(() => commitMasterImportSchema.parse({ expectedVersion: -1 })).toThrow();
  });
});

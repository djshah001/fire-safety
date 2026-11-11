import ExcelJS from 'exceljs';
import type { MasterImportPayload } from '../../infrastructure/database/schema/index.js';

export type MasterImportType = 'items' | 'vendors';

type ImportDefinition = {
  sheetName: string;
  headers: Array<{ key: string; label: string; required?: boolean; width: number }>;
  example: string[];
};

export const masterImportDefinitions: Record<MasterImportType, ImportDefinition> = {
  items: {
    sheetName: 'Items',
    headers: [
      { key: 'code', label: 'code', required: true, width: 20 },
      { key: 'name', label: 'name', required: true, width: 36 },
      { key: 'category', label: 'category', required: true, width: 22 },
      { key: 'unit', label: 'unit', required: true, width: 16 },
      { key: 'family', label: 'family', width: 22 },
      { key: 'costing_brand', label: 'costing_brand', width: 22 },
      { key: 'model', label: 'model', width: 20 },
      { key: 'specification', label: 'specification', width: 40 },
      { key: 'initial_rate', label: 'initial_rate', width: 18 },
    ],
    example: [
      'FA-PANEL-001',
      'Addressable Fire Alarm Control Panel - 2 Loop',
      'PANELS',
      'NOS',
      'ALARM_PANELS',
      'SCHNEIDER',
      'TX-3002',
      '2-loop addressable panel with battery backup',
      '25000.00',
    ],
  },
  vendors: {
    sheetName: 'Vendors',
    headers: [
      { key: 'code', label: 'code', width: 18 },
      { key: 'display_name', label: 'display_name', required: true, width: 32 },
      { key: 'legal_name', label: 'legal_name', width: 34 },
      { key: 'vendor_type', label: 'vendor_type', width: 22 },
      { key: 'contact_name', label: 'contact_name', width: 24 },
      { key: 'contact_phone', label: 'contact_phone', width: 20 },
      { key: 'contact_email', label: 'contact_email', width: 28 },
      { key: 'gst_status', label: 'gst_status', width: 18 },
      { key: 'gstin', label: 'gstin', width: 22 },
      { key: 'pan', label: 'pan', width: 16 },
      { key: 'address_line_1', label: 'address_line_1', width: 36 },
      { key: 'city', label: 'city', width: 20 },
      { key: 'state', label: 'state', width: 20 },
      { key: 'postal_code', label: 'postal_code', width: 16 },
      { key: 'payment_terms', label: 'payment_terms', width: 24 },
    ],
    example: [
      'VEN-001',
      'Siemens India Ltd',
      'Siemens India Private Limited',
      'manufacturer',
      'Rajesh Sharma',
      '9825012345',
      'rajesh.sharma@siemens.example.test',
      'registered',
      '24AAACS1234A1Z1',
      'AAACS1234A',
      'Plot 45, GIDC Industrial Estate',
      'Vadodara',
      'Gujarat',
      '390010',
      '30 Days Net',
    ],
  },
};

export async function buildMasterImportTemplate(type: MasterImportType) {
  const definition = masterImportDefinitions[type];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Fire Safety ERP';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(definition.sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  worksheet.columns = definition.headers.map((header) => ({
    header: header.label,
    key: header.key,
    width: header.width,
  }));
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBE123C' } };
  headerRow.alignment = { vertical: 'middle' };
  headerRow.height = 24;
  worksheet.addRow(definition.example);
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: definition.headers.length },
  };
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function normalizedHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export async function readMasterImportWorkbook(type: MasterImportType, filePath: string) {
  const definition = masterImportDefinitions[type];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('The workbook does not contain a worksheet.');
  if (worksheet.actualRowCount < 2) throw new Error('The worksheet does not contain any data rows.');
  if (worksheet.actualRowCount > 501) throw new Error('A single import can contain at most 500 data rows.');

  const headerPositions = new Map<string, number>();
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    const header = normalizedHeader(cell.text);
    if (header) headerPositions.set(header, column);
  });
  const missingHeaders = definition.headers
    .filter((header) => header.required && !headerPositions.has(header.key))
    .map((header) => header.label);
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required columns: ${missingHeaders.join(', ')}.`);
  }

  const rows: Array<{ rowNumber: number; payload: MasterImportPayload }> = [];
  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const payload = Object.fromEntries(
      definition.headers.map((header) => {
        const column = headerPositions.get(header.key);
        const cell = column ? row.getCell(column) : undefined;
        if (cell?.type === ExcelJS.ValueType.Formula) {
          throw new Error(`Formula values are not allowed (row ${rowNumber}, column ${header.label}).`);
        }
        const value = cell?.text.trim() ?? '';
        return [header.key, value || null];
      }),
    ) as MasterImportPayload;
    if (Object.values(payload).every((value) => !value)) continue;
    rows.push({ rowNumber, payload });
  }
  if (rows.length === 0) throw new Error('The worksheet does not contain any non-empty data rows.');
  return rows;
}


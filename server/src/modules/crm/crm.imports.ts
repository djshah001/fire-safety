import ExcelJS from 'exceljs';
import type { CrmImportPayload } from '../../infrastructure/database/schema/index.js';

export type CrmImportType = 'customers' | 'open_leads';

type ImportDefinition = {
  sheetName: string;
  headers: Array<{ key: string; label: string; required?: boolean; width: number }>;
  example: string[];
};

export const importDefinitions: Record<CrmImportType, ImportDefinition> = {
  customers: {
    sheetName: 'Customers',
    headers: [
      { key: 'display_name', label: 'display_name', required: true, width: 28 },
      { key: 'legal_name', label: 'legal_name', width: 28 },
      { key: 'contact_name', label: 'contact_name', required: true, width: 24 },
      { key: 'job_title', label: 'job_title', width: 20 },
      { key: 'phone', label: 'phone', width: 18 },
      { key: 'email', label: 'email', width: 28 },
      { key: 'site_name', label: 'site_name', width: 22 },
      { key: 'site_address', label: 'site_address', width: 34 },
      { key: 'city', label: 'city', width: 20 },
      { key: 'state', label: 'state', width: 20 },
      { key: 'postal_code', label: 'postal_code', width: 16 },
      { key: 'country', label: 'country', width: 18 },
    ],
    example: ['Example Industries', 'Example Industries Pvt Ltd', 'Anita Shah', 'Facilities Head', '9876543210', 'anita@example.test', 'Main warehouse', '12 Industrial Estate', 'Ahmedabad', 'Gujarat', '380001', 'India'],
  },
  open_leads: {
    sheetName: 'Open leads',
    headers: [
      { key: 'inquiry_name', label: 'inquiry_name', required: true, width: 30 },
      { key: 'company_name', label: 'company_name', width: 28 },
      { key: 'contact_name', label: 'contact_name', required: true, width: 24 },
      { key: 'phone', label: 'phone', width: 18 },
      { key: 'email', label: 'email', width: 28 },
      { key: 'address', label: 'address', width: 34 },
      { key: 'source', label: 'source', required: true, width: 20 },
      { key: 'service_category_code', label: 'service_category_code', required: true, width: 24 },
      { key: 'owner_email', label: 'owner_email', width: 28 },
    ],
    example: ['Warehouse alarm enquiry', 'Example Industries', 'Anita Shah', '9876543210', 'anita@example.test', '12 Industrial Estate, Ahmedabad', 'Referral', 'FIRE_ALARM', 'sales@example.test'],
  },
};

export async function buildImportTemplate(type: CrmImportType) {
  const definition = importDefinitions[type];
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

export async function readImportWorkbook(type: CrmImportType, filePath: string) {
  const definition = importDefinitions[type];
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

  const rows: Array<{ rowNumber: number; payload: CrmImportPayload }> = [];
  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const payload = Object.fromEntries(definition.headers.map((header) => {
      const column = headerPositions.get(header.key);
      const cell = column ? row.getCell(column) : undefined;
      if (cell?.type === ExcelJS.ValueType.Formula) {
        throw new Error(`Formula values are not allowed (row ${rowNumber}, column ${header.label}).`);
      }
      const value = cell?.text.trim() ?? '';
      return [header.key, value || null];
    })) as CrmImportPayload;
    if (Object.values(payload).every((value) => !value)) continue;
    rows.push({ rowNumber, payload });
  }
  if (rows.length === 0) throw new Error('The worksheet does not contain any non-empty data rows.');
  return rows;
}

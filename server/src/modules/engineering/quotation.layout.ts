import { Decimal } from 'decimal.js';

type LayoutLine = { section?: string; itemName: string; specification: string; brandName: string | null };

export function describeQuotationLine(line: LayoutLine) {
  const fields: string[] = [], paragraphs: string[] = [];
  for (const part of line.specification.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) {
    if (/^(head|discharge|capacity|pump capacity|diameter|nominal diameter|length|material|class|standard|configuration|construction|cores?|core count|cross.section|conductor.*|agent|dial size)\s*:/i.test(part)) fields.push(part);
    else paragraphs.push(part);
  }
  return { scope: paragraphs.join('\n'), fields, family: line.itemName.replace(/\s+\d+(?:\.\d+)?\s*mm$/i, '') };
}

export function groupQuotationLines<T extends LayoutLine>(lines: T[]) {
  const groups: Array<{ section: string; scope: string; family: string; commonFields: string[]; lines: T[] }> = [];
  for (const line of lines) {
    const description = describeQuotationLine(line), section = line.section?.trim() || 'Scope';
    const previous = groups.at(-1);
    if (previous && description.scope.length > 50 && previous.scope === description.scope && previous.family === description.family && previous.section === section) previous.lines.push(line);
    else groups.push({ section, ...description, commonFields: [], lines: [line] });
  }
  for (const group of groups) {
    if (group.lines.length > 1) group.commonFields = describeQuotationLine(group.lines[0]!).fields.filter((field) => group.lines.every((line) => describeQuotationLine(line).fields.includes(field)));
  }
  return groups;
}

export function markupHeading(lines: Array<{ markupPercent: string }>) {
  const percentages = new Set(lines.map((line) => new Decimal(line.markupPercent).toString()));
  return percentages.size === 1 ? `${[...percentages][0]}%` : 'Markup';
}

export function quotationTerms(exclusions: string, paymentTerms: string) {
  const position = exclusions.indexOf('\n8. NOC Charges:');
  const inlinePayment = position >= 0 && paymentTerms.startsWith('7. Payment Terms:');
  return { inlinePayment, terms: inlinePayment ? `${exclusions.slice(0, position)}\n${paymentTerms}${exclusions.slice(position)}` : exclusions };
}

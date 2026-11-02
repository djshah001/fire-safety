import { Decimal } from 'decimal.js';
import type { PoolClient } from 'pg';
import reference from './data/boq-reference.json' with { type: 'json' };

export const referenceProducts = reference.products;
export const referenceSource = reference.source;

const labels: Record<string, [string, string | null]> = {
  diameter: ['Nominal diameter', 'mm'], head: ['Head', 'm'], discharge: ['Discharge', 'LPM'],
  capacity: ['Capacity', 'kg'], length: ['Length', 'm'], dial_size: ['Dial size', 'mm'],
  cross_section: ['Conductor cross-section', 'sq. mm'], cores: ['Core count', null],
};

export function referenceSpecification(product: typeof referenceProducts[number]) {
  return [product.scope, ...Object.entries(product.specifications)
    .filter(([, value]) => value !== undefined).map(([key, value]) => `${labels[key]?.[0] ?? key}: ${value}${labels[key]?.[1] ? ` ${labels[key]![1]}` : ''}`)].join('\n');
}

async function id(client: PoolClient, sql: string, values: unknown[]) {
  const row = (await client.query<{ id: string }>(sql, values)).rows[0];
  if (!row) throw new Error('Reference catalogue could not resolve a required record.');
  return row.id;
}

export async function seedReferenceCatalogue(client: PoolClient, companyId: string, actorId: string) {
  const categoryIds = new Map<string, string>();
  for (const [code, name] of [
    ['DEMO-PUMP', 'Fire pumps and controls'], ['DEMO-VALVE', 'Fire valves'],
    ['DEMO-HYDRANT', 'Hydrant equipment'], ['DEMO-SPRINKLER', 'Fire sprinklers'],
    ['DEMO-SERVICE', 'Fire safety services'],
    ['DEMO-EXT', 'Fire extinguishers'], ['DEMO-DET', 'Fire detection'], ['DEMO-PIP', 'Fire piping'],
  ]) {
    categoryIds.set(code!, await id(client, `
      insert into item_categories (company_id, code, name, name_normalized, created_by_user_id)
      values ($1, $2, $3::text, lower($3::text), $4)
      on conflict (company_id, code) do update set code = item_categories.code returning id
    `, [companyId, code, name, actorId]));
  }
  await client.query(`
    insert into units (company_id, code, name, name_normalized, symbol, created_by_user_id)
    values ($1, 'DEMO-KG', 'Kilogram', 'kilogram', 'kg', $2) on conflict (company_id, code) do nothing
  `, [companyId, actorId]);
  const unitIds = new Map((await client.query<{ id: string; code: string }>(`
    select id, code from units where company_id = $1 and code in ('DEMO-NOS', 'DEMO-MTR', 'DEMO-LOT', 'DEMO-KG')
  `, [companyId])).rows.map((row) => [row.code, row.id]));
  const brandIds = new Map<string, string>();
  for (const name of new Set(referenceProducts.flatMap((product) => product.brands))) {
    brandIds.set(name, await id(client, `
      insert into brands (company_id, code, name, name_normalized, created_by_user_id)
      values ($1, $2, $3::text, lower($3::text), $4)
      on conflict (company_id, name_normalized) do update set name = brands.name returning id
    `, [companyId, `DEMO-REF-${name.replaceAll(/[^A-Z0-9]/g, '')}`, name, actorId]));
  }
  const families = new Map<string, string>();
  for (const product of referenceProducts) {
    if (!families.has(product.familyCode)) {
      const familyId = await id(client, `
        insert into item_families (company_id, category_id, code, name, name_normalized, scope_description, default_unit_id, created_by_user_id)
        values ($1, $2, $3, $4::text, lower($4::text), $5, $6, $7)
        on conflict (company_id, code) do update set code = item_families.code returning id
      `, [companyId, categoryIds.get(product.categoryCode), product.familyCode, `${product.familyName} (BOQ demo)`,
        product.scope, unitIds.get(product.unitCode), actorId]);
      families.set(product.familyCode, familyId);
      for (const [sortOrder, [key, value]] of Object.entries(product.specifications).entries()) {
        if (value === undefined) continue;
        const [label, unit] = labels[key] ?? [key[0]!.toUpperCase() + key.slice(1).replaceAll('_', ' '), null];
        await client.query(`
          insert into item_family_specifications (company_id, family_id, key, label, value_type, unit_label, is_required, sort_order)
          values ($1, $2, $3, $4, $5, $6, true, $7) on conflict (family_id, key) do nothing
        `, [companyId, familyId, key, label, typeof value === 'number' ? 'number' : 'text', unit, sortOrder + 1]);
      }
    }
    const specification = referenceSpecification(product);
    const itemId = await id(client, `
      insert into items (company_id, code, name, name_normalized, specification, family_id, category_id, unit_id, specification_values, created_by_user_id)
      values ($1, $2, $3::text, lower($3::text), $4, $5, $6, $7, $8::jsonb, $9)
      on conflict (company_id, code) do update set code = items.code returning id
    `, [companyId, product.code, product.name, specification, families.get(product.familyCode),
      categoryIds.get(product.categoryCode), unitIds.get(product.unitCode), JSON.stringify(product.specifications), actorId]);
    // IS standards are technical requirements. Services and standard-only rows stay unbranded.
    const brands: Array<string | null> = product.brands.length ? product.brands : [null];
    const options = brands.map((brand, index) => ({ brand, factor: new Decimal(1).plus(new Decimal(index).mul('0.12')), model: `DEMO-R${product.sourceRow}-BASE`, preferred: index === 0 }));
    // Show that one make can have multiple independently priced models too.
    if (product.sourceRow === 59) options.push({ brand: brands[0]!, factor: new Decimal('1.08'), model: 'DEMO-R59-ALTERNATE', preferred: false });
    for (const [index, option] of options.entries()) {
      const brandId = option.brand ? brandIds.get(option.brand) : null;
      if (brandId) await client.query(`insert into item_brands (company_id, item_id, brand_id, created_by_user_id) values ($1, $2, $3, $4) on conflict do nothing`, [companyId, itemId, brandId, actorId]);
      // Explicit lookup handles nullable brand identities as PostgreSQL NULLs are distinct.
      let offeringId = (await client.query<{ id: string }>(`
        select id from item_brand_offerings where item_id = $1 and brand_id is not distinct from $2::uuid and manufacturer_model = $3
      `, [itemId, brandId, option.model])).rows[0]?.id;
      if (!offeringId) offeringId = await id(client, `
        insert into item_brand_offerings (company_id, item_id, brand_id, manufacturer_model, manufacturer_sku, is_preferred, created_by_user_id)
        values ($1, $2, $3, $4, $5, $6 and not exists (select 1 from item_brand_offerings where item_id = $2 and is_preferred and status = 'active'), $7) returning id
      `, [companyId, itemId, brandId, option.model, `${product.code}-${index + 1}`, option.preferred, actorId]);
      for (const [date, historyFactor] of [['2026-01-01', '0.95'], ['2026-10-01', '1']] as const) {
        const multiplier = option.factor.mul(historyFactor);
        const note = [
          `Demo only; BOQ.xlsx sheet 1 row ${product.sourceRow}. Model/SKU and effective dates are synthetic.`,
          index ? 'Alternate make/model rates are synthetic independent examples, not supplier prices.' : 'Reference group rate used as the first demo offering basis.',
          ...product.demoAssumptions,
        ].join(' ');
        await client.query(`
          insert into item_rate_versions (company_id, item_id, offering_id, currency, effective_from, supply_rate, labour_rate, miscellaneous_rate, miscellaneous_note, created_by_user_id)
          values ($1, $2, $3, 'INR', $4, $5, $6, $7, $8, $9)
          on conflict (offering_id, currency, effective_from) do nothing
        `, [companyId, itemId, offeringId, date, new Decimal(product.supplyRate).mul(multiplier).toFixed(4),
          new Decimal(product.labourRate).mul(multiplier).toFixed(4), new Decimal(product.miscellaneousRate).mul(multiplier).toFixed(4), note, actorId]);
      }
    }
  }
}

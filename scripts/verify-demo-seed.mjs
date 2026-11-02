import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const { config } = require('dotenv');
const { Pool } = require('pg');
config({ path: 'server/.env', quiet: true });
const source = new URL(process.env.DATABASE_URL);
if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(source.hostname)) throw new Error('Seed verification requires a non-production loopback PostgreSQL server.');
// Only this freshly created database can be dropped by this run.
const name = `fire_safety_seed_${randomUUID().replaceAll('-', '').slice(0, 8)}_test`;
if (!/^fire_safety_seed_[a-f0-9]{8}_test$/.test(name)) throw new Error('Invalid isolated database name.');
const adminUrl = new URL(source); adminUrl.pathname = '/postgres';
const admin = new Pool({ connectionString: adminUrl.toString() });
const target = new URL(source); target.pathname = `/${name}`;
let created = false;
let database;
const environment = {
  ...process.env, DATABASE_URL: target.toString(), NODE_ENV: 'test', LOG_LEVEL: 'silent', MAIL_DELIVERY_MODE: 'disabled',
  UPLOAD_ROOT: './.local/demo-seed-verification-uploads', DEMO_SEED_PASSWORD: randomUUID() + 'Aa1!',
  BOOTSTRAP_COMPANY_NAME: 'Demo seed verification company', BOOTSTRAP_BRANCH_NAME: 'Test branch',
  BOOTSTRAP_ADMIN_NAME: 'Test administrator', BOOTSTRAP_ADMIN_EMAIL: 'seed-admin@example.test', BOOTSTRAP_ADMIN_PASSWORD: randomUUID() + 'Aa1!',
};
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: 'server', env: environment, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')} failed:\n${result.stderr}\n${result.stdout.replace(/^Password:.*$/gm, 'Password: [redacted]')}`);
}
try {
  await admin.query(`create database ${name}`); created = true;
  run(['../node_modules/drizzle-kit/bin.cjs', 'migrate']);
  run(['--import', 'tsx', 'src/scripts/bootstrapAdmin.ts']);
  run(['--import', 'tsx', 'src/scripts/seedDemo.ts']);
  database = new Pool({ connectionString: target.toString() });
  const scalar = async (sql) => (await database.query(sql)).rows[0];
  const counts = await scalar(`select (select count(*) from items) as items, (select count(*) from item_families) as families,
    (select count(*) from brands) as brands, (select count(*) from item_brand_offerings) as offerings,
    (select count(*) from item_rate_versions) as rates, (select count(*) from leads) as leads,
    (select count(*) from design_jobs) as jobs, (select count(*) from quotation_revisions) as quotations`);
  assert.equal(counts.items, '44'); assert.equal(counts.families, '35'); assert.equal(counts.brands, '16');
  assert.equal(counts.leads, '28'); assert.equal(counts.jobs, '21'); assert.equal(counts.quotations, '8');
  const sample = await scalar(`select grand_total, status, cash_percentage from quotation_revisions r join quotations q on q.id = r.quotation_id where q.quotation_number = 'DEMO-QUOTE-PLANNED'`);
  assert.equal(sample.grand_total, '941097.20'); assert.equal(sample.status, 'accepted'); assert.equal(sample.cash_percentage, '20.00');
  const pending = await scalar(`select status, cash_percentage from quotation_revisions r join quotations q on q.id = r.quotation_id where q.quotation_number = 'DEMO-QUOTE-ACCEPTED'`);
  assert.equal(pending.status, 'accepted'); assert.equal(pending.cash_percentage, null);
  const fullScope = await database.query(`select count(l.id)::int as lines, count(distinct l.section_snapshot)::int as sections
    from quotation_lines l join quotation_revisions r on r.id = l.quotation_revision_id join quotations q on q.id = r.quotation_id
    where q.quotation_number like 'DEMO-QUOTE-%' or q.quotation_number = 'DEMO-ADMIN-OVERRIDE' group by r.id`);
  assert.equal(fullScope.rowCount, 6); assert.ok(fullScope.rows.every((row) => row.lines === 39 && row.sections === 3));
  const stages = (await database.query(`select r.status from boq_revisions r join design_jobs j on j.id = r.design_job_id
    join leads l on l.id = j.lead_id where l.lead_number like 'DEMO-LATEST-BOQ-%' order by r.status`)).rows.map((row) => row.status).sort();
  assert.deepEqual(stages, ['draft', 'submitted', 'costing', 'purchase_review', 'admin_review'].sort());
  const options = await scalar(`select count(*)::int as count from estimate_cost_lines c join boq_revisions b on b.id = c.boq_revision_id
    join design_jobs j on j.id = b.design_job_id join leads l on l.id = j.lead_id where l.lead_number = 'DEMO-LATEST-BOQ-COSTING' and c.markup_percent is null and c.quoted_unit_rate is null`);
  assert.equal(options.count, 50);
  const files = (await database.query(`select original_name, storage_name, checksum_sha256, size_bytes from quotation_issue_documents`)).rows;
  assert.equal(files.length, 4);
  for (const file of files) {
    const data = await readFile(new URL(`../server/.local/demo-seed-verification-uploads/${file.storage_name}`, import.meta.url));
    assert.equal(data.subarray(0, 5).toString(), '%PDF-'); assert.equal(data.byteLength, file.size_bytes);
    assert.equal(createHash('sha256').update(data).digest('hex'), file.checksum_sha256);
  }
  // Mutable user edits and returned work must survive reruns, alongside issued history.
  await database.query(`update quotation_revisions set exclusions = 'User-edited demo terms retained' where status = 'draft'`);
  await database.query(`update boq_revisions set status = 'returned' where status = 'purchase_review'`);
  const snapshot = async () => JSON.stringify((await database.query(`select
    (select jsonb_agg(to_jsonb(r) order by r.id) from item_rate_versions r) as rates,
    (select jsonb_agg(to_jsonb(r) order by r.id) from quotation_revisions r) as quotations,
    (select jsonb_agg(to_jsonb(r) order by r.id) from quotation_lines r) as lines,
    (select jsonb_agg(to_jsonb(r) order by r.id) from quotation_issue_documents r) as files,
    (select jsonb_agg(to_jsonb(r) order by r.id) from boq_revisions r) as boqs,
    (select jsonb_agg(to_jsonb(r) order by r.id) from design_package_revisions r) as designs,
    (select jsonb_agg(to_jsonb(r) order by r.id) from design_deadline_extensions r) as buffers,
    (select jsonb_agg(to_jsonb(r) order by r.id) from design_jobs r) as jobs`)).rows[0]);
  const before = await snapshot();
  run(['--import', 'tsx', 'src/scripts/seedDemo.ts']);
  assert.equal(await snapshot(), before, 'Rerunning the seed changed tested workflow state or immutable snapshots.');
  const afterCounts = await scalar('select count(*) as count from item_brand_offerings');
  assert.equal(afterCounts.count, counts.offerings, 'Unbranded offerings duplicated.');
  console.log(JSON.stringify({ verified: true, ...counts, referenceProducts: 39, referenceTotal: sample.grand_total, issuedPdfs: files.length, rerunPreservesHistory: true }));
} finally {
  if (database) {
    const files = (await database.query('select storage_name from quotation_issue_documents')).rows;
    for (const file of files) {
      if (!/^[a-f0-9-]{36}\.pdf$/.test(file.storage_name)) throw new Error('Unexpected test storage key.');
      await unlink(new URL(`../server/.local/demo-seed-verification-uploads/${file.storage_name}`, import.meta.url));
    }
    await database.end();
  }
  if (created) await admin.query(`drop database ${name} with (force)`);
  await admin.end();
}

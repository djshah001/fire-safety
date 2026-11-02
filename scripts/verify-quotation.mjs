import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const { config } = require('dotenv');
const { Pool } = require('pg');
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
config({ path: 'server/.env', quiet: true });
if (process.env.NODE_ENV === 'production') throw new Error('Local quotation verification is disabled in production.');
const source = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(source.hostname)) throw new Error('Local database required.');
const name = 'fire_safety_quotation_workflow_test';
const adminUrl = new URL(source); adminUrl.pathname = '/postgres';
const connection = new Pool({ connectionString: adminUrl.toString() });
try {
  const existing = await connection.query('select 1 from pg_database where datname=$1', [name]);
  if (!existing.rowCount) await connection.query(`create database ${name}`);
} finally { await connection.end(); }
const target = new URL(source); target.pathname = `/${name}`;
const environment = { ...process.env, LOG_LEVEL: 'silent', DATABASE_URL: target.toString(), INTEGRATION_DATABASE_URL: target.toString(), NODE_ENV: 'test', MAIL_DELIVERY_MODE: 'disabled', UPLOAD_ROOT: './.local/quotation-test-uploads', BOOTSTRAP_COMPANY_NAME: 'Quotation integration company', BOOTSTRAP_BRANCH_NAME: 'Test branch', BOOTSTRAP_ADMIN_NAME: 'Test Administrator', BOOTSTRAP_ADMIN_EMAIL: 'quotation-admin@example.test', BOOTSTRAP_ADMIN_PASSWORD: randomUUID() + 'Aa1!' };
const run = (args) => { const result = spawnSync(process.execPath, args, { cwd: 'server', env: environment, stdio: 'inherit' }); if (result.status !== 0) throw new Error(`Verification command failed: ${args[0]}`); };
run(['../node_modules/drizzle-kit/bin.cjs', 'migrate']);
const testDb = new Pool({ connectionString: target.toString() });
let initialized;
try {
  const companyRows = (await testDb.query('select name from companies')).rows;
  initialized = companyRows.length > 0;
  if (initialized && (companyRows.length !== 1 || companyRows[0].name !== 'Quotation integration company')) {
    throw new Error('Refusing fixture cleanup: this test database contains an unrecognized company.');
  }
} finally { await testDb.end(); }
if (!initialized) run(['--import', 'tsx', 'src/scripts/bootstrapAdmin.ts']);
run(['../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.integration.config.ts', 'src/p3-quotation.integration.test.ts']);

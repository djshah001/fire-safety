import { env } from '../config/env.js';
import { closeDatabase, pool } from '../infrastructure/database/db.js';

const databaseUrl = new URL(env.DATABASE_URL);
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
if (env.NODE_ENV === 'production' || !loopbackHosts.has(databaseUrl.hostname)) {
  throw new Error('Demo reset refused: DATABASE_URL must target a loopback host outside production.');
}
if (!process.argv.includes('--confirm')) {
  throw new Error('Demo reset requires --confirm. This removes all operational data from the local development company.');
}

const preservedTables = new Set([
  'companies', 'branches', 'permissions', 'roles', 'role_permissions', '__drizzle_migrations',
  'users', 'user_role_assignments', 'scoped_grants', 'auth_sessions', 'password_reset_tokens',
]);

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function reset() {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const companies = await client.query<{ id: string; name: string }>('select id, name from companies where is_active = true order by created_at');
    if (companies.rowCount !== 1) throw new Error('Demo reset requires exactly one active local company.');

    const before = await client.query<{ demoUsers: number; leads: number; customers: number; projects: number; requisitions: number }>(`
      select
        (select count(*) from users where employee_code like 'DEMO-%' and email_normalized like 'demo.%@example.test')::int as "demoUsers",
        (select count(*) from leads)::int as leads,
        (select count(*) from customers)::int as customers,
        (select count(*) from projects)::int as projects,
        (select count(*) from procurement_requisitions)::int as requisitions
    `);
    const tableRows = await client.query<{ tablename: string }>(`
      select tablename from pg_tables where schemaname = 'public' order by tablename
    `);
    const targets = tableRows.rows.map((row) => row.tablename).filter((table) => !preservedTables.has(table));
    if (targets.length === 0) throw new Error('Demo reset found no operational tables.');
    await client.query(`truncate table ${targets.map(quoteIdentifier).join(', ')} restart identity`);
    await client.query(`delete from users where employee_code like 'DEMO-%' and email_normalized like 'demo.%@example.test'`);
    await client.query('commit');
    const counts = before.rows[0]!;
    process.stdout.write([
      `Removed local operational demo data for ${companies.rows[0]!.name}.`,
      `Deleted ${counts.demoUsers} demo users, ${counts.customers} customers, ${counts.leads} leads, ${counts.projects} projects and ${counts.requisitions} requisitions plus their dependent records.`,
      'Preserved non-demo users, their access/session data, the company, branches, roles, permissions and migration history.',
    ].join('\n') + '\n');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

reset().finally(closeDatabase);

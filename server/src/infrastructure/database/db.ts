import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../../config/env.js';
import * as schema from './schema/index.js';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 3_000,
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;
export type DatabaseExecutor = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;

export async function checkDatabaseConnection() {
  await pool.query('select 1 as ready');
}

export async function closeDatabase() {
  await pool.end();
}

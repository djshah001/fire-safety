import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for Drizzle commands.');
}

export default defineConfig({
  schema: './src/infrastructure/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});

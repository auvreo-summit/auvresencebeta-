import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

// Prefer an explicit migration identity; otherwise migrate the same database
// the runtime connects to. Never silently choose a different local database.
const adminUser = process.env.SQL_ADMIN_USER;
const host = process.env.SQL_HOST;
const database = process.env.SQL_DB_NAME;
const user = adminUser || process.env.SQL_USER;
const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD;
const url = process.env.DATABASE_URL;
if (!url && (!host || !database || !user)) {
  throw new Error('Configure DATABASE_URL, or SQL_HOST, SQL_DB_NAME and SQL_USER (SQL_ADMIN_USER for a separate migration identity).');
}
let credentials: { url: string } | { host: string; port: number; database: string; user: string; password?: string };
if (url) {
  const target = new URL(url);
  if (adminUser) { target.username = adminUser; target.password = process.env.SQL_ADMIN_PASSWORD || ''; }
  credentials = { url: target.toString() };
} else {
  credentials = { host: host!, port: Number(process.env.SQL_PORT || 5432), database: database!, user: user!, password };
}

export default defineConfig({ schema: './src/db/schema.ts', out: './drizzle', dialect: 'postgresql', schemaFilter: ['public'], dbCredentials: credentials, verbose: false });

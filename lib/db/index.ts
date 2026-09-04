import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

// Reuse the connection across hot reloads in dev.
const globalForDb = globalThis as unknown as { __winthropSql?: postgres.Sql };
const sql = globalForDb.__winthropSql ?? postgres(url, { max: 10, prepare: false });
if (process.env.NODE_ENV !== 'production') globalForDb.__winthropSql = sql;

export const db = drizzle(sql, { schema });
export type Db = typeof db;
/** Transaction handle type, for functions that must run inside a transaction. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export { schema };

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { readFileSync, writeFileSync } from "fs";

const { Pool } = pg;

const DEFAULT_DATABASE_URL = "postgresql://postgres:wtt%40adm123@122.165.225.42:5432/colombo";
export const DB_URL_PATH = "/tmp/.colombo_db_url";

function getConnectionString() {
  if (process.env.COLOMBO_DB_URL) return process.env.COLOMBO_DB_URL;
  try {
    const url = readFileSync(DB_URL_PATH, "utf-8").trim();
    if (url) return url;
  } catch {}
  return DEFAULT_DATABASE_URL;
}

export let pool = new Pool({ connectionString: getConnectionString() });
export let db = drizzle(pool, { schema });

export async function switchDatabase(connectionString: string): Promise<void> {
  const newPool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
  const client = await newPool.connect();
  client.release();
  try { await pool.end(); } catch {}
  pool = newPool;
  db = drizzle(newPool, { schema });
  writeFileSync(DB_URL_PATH, connectionString, "utf-8");
}

export * from "./schema";

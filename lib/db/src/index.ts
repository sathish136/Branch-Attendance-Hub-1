import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const { Pool } = pg;

const DEFAULT_DATABASE_URL = "postgresql://postgres:wtt%40adm123@122.165.225.42:5432/colombo";
export const DB_URL_PATH = join(tmpdir(), ".colombo_db_url");

function getConnectionString() {
  if (process.env.COLOMBO_DB_URL) return process.env.COLOMBO_DB_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
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

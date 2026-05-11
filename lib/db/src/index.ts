import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { config as dotenvConfig } from "dotenv";

// Load .env from the project root (works locally; no-op if file absent)
dotenvConfig({ path: join(process.cwd(), ".env") });
dotenvConfig({ path: join(process.cwd(), "../../.env") }); // when run from a sub-package

const { Pool } = pg;

const DEFAULT_DATABASE_URL = "postgresql://postgres:wtt%40adm123@122.165.225.42:5432/colombo";

const WORKSPACE_DIR = process.env.REPL_HOME || "/home/runner/workspace";
export const DB_URL_PATH = join(WORKSPACE_DIR, ".colombo_db_url");

function getConnectionString() {
  // 1. Explicit Colombo override
  if (process.env.COLOMBO_DB_URL) return process.env.COLOMBO_DB_URL;
  // 2. Generic DATABASE_URL (standard for most local setups)
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // 3. Persisted URL from the UI settings page
  try {
    const url = readFileSync(DB_URL_PATH, "utf-8").trim();
    if (url) return url;
  } catch {}
  // 4. Hardcoded production fallback
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
  try {
    mkdirSync(WORKSPACE_DIR, { recursive: true });
    writeFileSync(DB_URL_PATH, connectionString, "utf-8");
  } catch {}
}

export * from "./schema";

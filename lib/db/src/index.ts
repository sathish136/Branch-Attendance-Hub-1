import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { readFileSync } from "fs";

const { Pool } = pg;

const DEFAULT_DATABASE_URL = "postgresql://postgres:wtt%40adm123@122.165.225.42:5432/colombo";
const DB_URL_FILE = "/tmp/.colombo_db_url";

function getConnectionString() {
  if (process.env.COLOMBO_DB_URL) return process.env.COLOMBO_DB_URL;
  try {
    const url = readFileSync(DB_URL_FILE, "utf-8").trim();
    if (url) return url;
  } catch {}
  return DEFAULT_DATABASE_URL;
}

const connectionString = getConnectionString();

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });
export const DB_URL_PATH = DB_URL_FILE;
export * from "./schema";

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const DEFAULT_DATABASE_URL = "postgresql://postgres:wtt%40adm123@122.165.225.42:5432/colombo";

const connectionString = process.env.COLOMBO_DB_URL || DEFAULT_DATABASE_URL;

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";

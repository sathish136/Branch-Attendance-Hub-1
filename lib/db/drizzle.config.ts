import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import path from "path";

const DEFAULT_DATABASE_URL = "postgresql://postgres:wtt%40adm123@122.165.225.42:5432/colombo";
const dbUrl = process.env.COLOMBO_DB_URL || DEFAULT_DATABASE_URL;

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});

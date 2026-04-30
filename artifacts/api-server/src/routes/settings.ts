import { Router } from "express";
import { db, switchDatabase } from "@workspace/db";
import { systemSettings, holidays } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import pg from "pg";
import multer from "multer";
const { Client } = pg;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const [settings] = await db.select().from(systemSettings);
    if (!settings) {
      const [created] = await db.insert(systemSettings).values({}).returning();
      res.json({ ...created, workingDays: JSON.parse(created.workingDays), updatedAt: created.updatedAt.toISOString() });
      return;
    }
    res.json({ ...settings, workingDays: JSON.parse(settings.workingDays), updatedAt: settings.updatedAt.toISOString() });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.put("/", async (req, res) => {
  try {
    const { workingDays, ...rest } = req.body;
    const [existing] = await db.select().from(systemSettings);
    if (existing) {
      const [updated] = await db.update(systemSettings).set({ ...rest, workingDays: JSON.stringify(workingDays), updatedAt: new Date() }).where(eq(systemSettings.id, existing.id)).returning();
      res.json({ ...updated, workingDays: JSON.parse(updated.workingDays), updatedAt: updated.updatedAt.toISOString() });
    } else {
      const [created] = await db.insert(systemSettings).values({ ...rest, workingDays: JSON.stringify(workingDays) }).returning();
      res.json({ ...created, workingDays: JSON.parse(created.workingDays), updatedAt: created.updatedAt.toISOString() });
    }
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

router.get("/holidays", async (req, res) => {
  try {
    const all = await db.select().from(holidays);
    const year = req.query.year ? Number(req.query.year) : null;
    const filtered = year ? all.filter(h => h.date.startsWith(String(year))) : all;
    res.json(filtered.map(h => ({ ...h, createdAt: h.createdAt.toISOString() })));
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

router.post("/holidays", async (req, res) => {
  try {
    const [holiday] = await db.insert(holidays).values(req.body).returning();
    res.status(201).json({ ...holiday, createdAt: holiday.createdAt.toISOString() });
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

router.delete("/holidays/:id", async (req, res) => {
  try {
    await db.delete(holidays).where(eq(holidays.id, Number(req.params.id)));
    res.json({ message: "Deleted", success: true });
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

router.get("/db/current", (_req, res) => {
  const raw = process.env.COLOMBO_DB_URL || "postgresql://postgres:wtt%40adm123@122.165.225.42:5432/colombo";
  try {
    const url = new URL(raw);
    res.json({
      host: url.hostname,
      port: url.port || "5432",
      database: url.pathname.replace("/", ""),
      user: url.username,
      connected: true,
    });
  } catch {
    res.json({ host: "unknown", port: "5432", database: "unknown", user: "unknown", connected: false });
  }
});

router.post("/db/test", async (req, res) => {
  const { host, port, database, user, password } = req.body;
  if (!host || !database || !user) {
    res.status(400).json({ success: false, message: "Host, database name and username are required." });
    return;
  }
  const client = new Client({
    host, port: Number(port) || 5432, database, user, password,
    connectionTimeoutMillis: 5000,
    ssl: false,
  });
  try {
    await client.connect();
    const result = await client.query("SELECT version()");
    const version = result.rows[0]?.version?.split(" ").slice(0, 2).join(" ") || "PostgreSQL";
    await client.end();
    res.json({ success: true, message: `Connected successfully — ${version}` });
  } catch (e: any) {
    try { await client.end(); } catch {}
    res.json({ success: false, message: e.message || "Connection failed" });
  }
});

router.post("/db/apply", async (req, res) => {
  const { host, port, database, user, password } = req.body;
  if (!host || !database || !user) {
    res.status(400).json({ success: false, message: "Host, database name and username are required." });
    return;
  }
  const connStr = `postgresql://${user}:${encodeURIComponent(password)}@${host}:${Number(port) || 5432}/${database}`;
  try {
    await switchDatabase(connStr);
    res.json({ success: true, message: `Connected to ${database}@${host} — database switched successfully.` });
  } catch (e: any) {
    res.status(400).json({ success: false, message: `Connection failed: ${e.message || "Cannot connect to database"}` });
  }
});

router.get("/db/backup", async (_req, res) => {
  const raw = process.env.COLOMBO_DB_URL || "postgresql://postgres:wtt%40adm123@122.165.225.42:5432/colombo";
  const client = new Client({ connectionString: raw, connectionTimeoutMillis: 10000, ssl: false });
  try {
    await client.connect();
    const tablesRes = await client.query(
      `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    const tables: string[] = tablesRes.rows.map((r: any) => r.tablename);
    const backup: Record<string, any[]> = {};
    for (const table of tables) {
      const result = await client.query(`SELECT * FROM "${table}"`);
      backup[table] = result.rows;
    }
    await client.end();
    const date = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dbName = new URL(raw).pathname.replace("/", "");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="backup-${dbName}-${date}.json"`);
    res.json({ exportedAt: new Date().toISOString(), database: dbName, tables, data: backup });
  } catch (e: any) {
    try { await client.end(); } catch {}
    res.status(500).json({ success: false, message: e.message || "Backup failed" });
  }
});

router.post("/db/restore", upload.single("backup"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: "No backup file uploaded." });
    return;
  }
  const raw = process.env.COLOMBO_DB_URL || "postgresql://postgres:wtt%40adm123@122.165.225.42:5432/colombo";
  const client = new Client({ connectionString: raw, connectionTimeoutMillis: 10000, ssl: false });
  try {
    const content = JSON.parse(req.file.buffer.toString("utf-8"));
    if (!content.data || typeof content.data !== "object") {
      res.status(400).json({ success: false, message: "Invalid backup file format." });
      return;
    }
    await client.connect();
    const tables = Object.keys(content.data);
    let totalRows = 0;
    const ORDER = [
      "branches","departments","designations","shifts","system_settings","holidays",
      "system_users","employees","biometric_devices","biometric_logs","attendance_records",
    ];
    const sorted = [...ORDER.filter(t => tables.includes(t)), ...tables.filter(t => !ORDER.includes(t))];
    for (const table of sorted) {
      const rows: any[] = content.data[table];
      if (!rows || rows.length === 0) continue;
      const cols = Object.keys(rows[0]).map(c => `"${c}"`).join(", ");
      for (const row of rows) {
        const vals = Object.values(row).map((v, i) => `$${i + 1}`).join(", ");
        const params = Object.values(row).map(v => v === null ? null : v);
        await client.query(
          `INSERT INTO "${table}" (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING`,
          params
        );
      }
      totalRows += rows.length;
    }
    await client.end();
    res.json({ success: true, message: `Restored ${totalRows} rows across ${sorted.length} tables.` });
  } catch (e: any) {
    try { await client.end(); } catch {}
    res.status(500).json({ success: false, message: e.message || "Restore failed" });
  }
});

export default router;

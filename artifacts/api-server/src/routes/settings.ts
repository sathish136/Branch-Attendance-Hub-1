import { Router } from "express";
import { db, switchDatabase } from "@workspace/db";
import { systemSettings, holidays } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import pg from "pg";
const { Client } = pg;

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

export default router;

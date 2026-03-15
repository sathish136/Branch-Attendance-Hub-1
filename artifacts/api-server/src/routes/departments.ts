import { Router } from "express";
import { db } from "@workspace/db";
import { departments, designations } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const all = await db.select().from(departments).orderBy(departments.name);
    res.json(all.map(d => ({ ...d, createdAt: d.createdAt.toISOString() })));
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

router.post("/", async (req, res) => {
  try {
    const [dep] = await db.insert(departments).values(req.body).returning();
    res.status(201).json({ ...dep, createdAt: dep.createdAt.toISOString() });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.put("/:id", async (req, res) => {
  try {
    const [dep] = await db.update(departments).set(req.body).where(eq(departments.id, Number(req.params.id))).returning();
    res.json({ ...dep, createdAt: dep.createdAt.toISOString() });
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.delete(departments).where(eq(departments.id, Number(req.params.id)));
    res.json({ message: "Deleted", success: true });
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

export default router;

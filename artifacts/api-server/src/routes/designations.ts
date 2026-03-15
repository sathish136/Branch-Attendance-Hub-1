import { Router } from "express";
import { db } from "@workspace/db";
import { designations, departments } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const rows = await db.select({
      d: designations,
      deptName: departments.name,
    }).from(designations)
      .leftJoin(departments, eq(designations.departmentId, departments.id))
      .orderBy(designations.name);
    res.json(rows.map(r => ({ ...r.d, departmentName: r.deptName || null, createdAt: r.d.createdAt.toISOString() })));
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

router.post("/", async (req, res) => {
  try {
    const [des] = await db.insert(designations).values(req.body).returning();
    res.status(201).json({ ...des, createdAt: des.createdAt.toISOString() });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.put("/:id", async (req, res) => {
  try {
    const [des] = await db.update(designations).set(req.body).where(eq(designations.id, Number(req.params.id))).returning();
    res.json({ ...des, createdAt: des.createdAt.toISOString() });
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.delete(designations).where(eq(designations.id, Number(req.params.id)));
    res.json({ message: "Deleted", success: true });
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

export default router;

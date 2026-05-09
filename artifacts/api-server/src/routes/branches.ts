import { Router } from "express";
import { db } from "@workspace/db";
import { branches, employees } from "@workspace/db/schema";
import { eq, isNull, sql, and } from "drizzle-orm";
import { getRequestUser } from "../lib/request-user.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const user = await getRequestUser(req);
    const { parentId, type } = req.query;
    const allBranches = await db.select().from(branches);
    const empCounts = await db.select({
      branchId: employees.branchId,
      count: sql<number>`count(*)::int`
    }).from(employees).where(eq(employees.status, "active")).groupBy(employees.branchId);
    const countMap = new Map(empCounts.map(r => [r.branchId, r.count]));
    let result = allBranches;
    if (user && !user.isSuper && user.branchIds.length > 0) {
      const allowed = new Set(user.branchIds);
      result = result.filter(b => allowed.has(b.id));
    }
    if (parentId) result = result.filter(b => b.parentId === Number(parentId));
    if (type) result = result.filter(b => b.type === type);
    const parentMap = new Map(allBranches.map(b => [b.id, b.name]));
    res.json(result.map(b => ({
      ...b,
      parentName: b.parentId ? parentMap.get(b.parentId) || null : null,
      employeeCount: countMap.get(b.id) || 0,
      createdAt: b.createdAt.toISOString(),
    })));
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.post("/", async (req, res) => {
  try {
    const [branch] = await db.insert(branches).values(req.body).returning();
    res.status(201).json({ ...branch, parentName: null, employeeCount: 0, createdAt: branch.createdAt.toISOString() });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.get("/:id", async (req, res) => {
  try {
    const [branch] = await db.select().from(branches).where(eq(branches.id, Number(req.params.id)));
    if (!branch) { res.status(404).json({ message: "Not found", success: false }); return; }
    res.json({ ...branch, parentName: null, employeeCount: 0, createdAt: branch.createdAt.toISOString() });
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

router.put("/:id", async (req, res) => {
  try {
    const [branch] = await db.update(branches).set(req.body).where(eq(branches.id, Number(req.params.id))).returning();
    res.json({ ...branch, parentName: null, employeeCount: 0, createdAt: branch.createdAt.toISOString() });
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.delete(branches).where(eq(branches.id, Number(req.params.id)));
    res.json({ message: "Deleted", success: true });
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

export default router;

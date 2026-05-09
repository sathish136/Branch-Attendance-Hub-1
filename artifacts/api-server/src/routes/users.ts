import { Router } from "express";
import { db } from "@workspace/db";
import { systemUsers, branches } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/auth.js";

const router = Router();

// Usernames hidden from all frontend user management views
const SYSTEM_USERNAMES = ["liveu"];

function mapUser(u: any, branchNames: string[]) {
  const branchIds: number[] = JSON.parse(u.branchIds || "[]");
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    branchIds,
    branchNames,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword ?? false,
    lastLogin: u.lastLogin?.toISOString() || null,
    createdAt: u.createdAt.toISOString(),
  };
}

async function getBranchNames(branchIds: number[]): Promise<string[]> {
  if (!branchIds.length) return [];
  const all = await db.select().from(branches);
  return branchIds.map(id => all.find(b => b.id === id)?.name || "").filter(Boolean);
}

router.get("/", async (_req, res) => {
  try {
    const all = await db.select().from(systemUsers);
    const visible = all.filter(u => !SYSTEM_USERNAMES.includes(u.username));
    const result = await Promise.all(visible.map(async u => {
      const ids: number[] = JSON.parse(u.branchIds || "[]");
      const names = await getBranchNames(ids);
      return mapUser(u, names);
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

router.post("/", async (req, res) => {
  try {
    const { branchIds, password, ...rest } = req.body;
    const [user] = await db.insert(systemUsers).values({
      ...rest,
      branchIds: JSON.stringify(branchIds || []),
      passwordHash: hashPassword(password),
      mustChangePassword: true,
    }).returning();
    const names = await getBranchNames(branchIds || []);
    res.status(201).json(mapUser(user, names));
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.put("/:id", async (req, res) => {
  try {
    const { branchIds, password, ...rest } = req.body;
    const updates: any = { ...rest, branchIds: JSON.stringify(branchIds || []) };
    if (password) updates.passwordHash = hashPassword(password);
    const [user] = await db.update(systemUsers).set(updates).where(eq(systemUsers.id, Number(req.params.id))).returning();
    const names = await getBranchNames(branchIds || []);
    res.json(mapUser(user, names));
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.delete(systemUsers).where(eq(systemUsers.id, Number(req.params.id)));
    res.json({ message: "Deleted", success: true });
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

export default router;

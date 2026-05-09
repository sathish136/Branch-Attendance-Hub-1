import { Router } from "express";
import { db } from "@workspace/db";
import { systemUsers, branches } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, authMiddleware } from "../lib/auth.js";

const router = Router();

router.use(authMiddleware);

const SYSTEM_USERNAMES = ["liveu"];

const ROLE_HIERARCHY: Record<string, number> = {
  super_admin: 4,
  regional_admin: 3,
  branch_admin: 2,
  viewer: 1,
};

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

async function getRequester(req: any) {
  const userId = req.userId;
  if (userId === 0) return { role: "super_admin", branchIds: [] as number[], id: 0 };
  const [u] = await db.select().from(systemUsers).where(eq(systemUsers.id, userId));
  if (!u) return null;
  return { role: u.role, branchIds: JSON.parse(u.branchIds || "[]") as number[], id: u.id };
}

router.get("/", async (req, res) => {
  try {
    const requester = await getRequester(req);
    if (!requester) { res.status(401).json({ message: "Unauthorized", success: false }); return; }

    if (requester.role === "branch_admin" || requester.role === "viewer") {
      res.status(403).json({ message: "Access denied", success: false }); return;
    }

    const all = await db.select().from(systemUsers);
    let visible = all.filter(u => !SYSTEM_USERNAMES.includes(u.username));

    if (requester.role === "regional_admin") {
      const myBranchIds = new Set(requester.branchIds);
      visible = visible.filter(u => {
        if (u.role === "super_admin" || u.role === "regional_admin") return false;
        const uBranches: number[] = JSON.parse(u.branchIds || "[]");
        return uBranches.some(id => myBranchIds.has(id));
      });
    }

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
    const requester = await getRequester(req);
    if (!requester) { res.status(401).json({ message: "Unauthorized", success: false }); return; }

    if (requester.role === "branch_admin" || requester.role === "viewer") {
      res.status(403).json({ message: "Access denied", success: false }); return;
    }

    const { branchIds, password, ...rest } = req.body;

    if (requester.role === "regional_admin") {
      const reqRole = rest.role || "branch_admin";
      if (reqRole === "super_admin" || reqRole === "regional_admin") {
        res.status(403).json({ message: "You cannot create users with this role", success: false }); return;
      }
      const myBranchSet = new Set(requester.branchIds);
      const filteredBranches = (branchIds || []).filter((id: number) => myBranchSet.has(id));
      const [user] = await db.insert(systemUsers).values({
        ...rest,
        branchIds: JSON.stringify(filteredBranches),
        passwordHash: hashPassword(password),
        mustChangePassword: true,
      }).returning();
      const names = await getBranchNames(filteredBranches);
      res.status(201).json(mapUser(user, names)); return;
    }

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
    const requester = await getRequester(req);
    if (!requester) { res.status(401).json({ message: "Unauthorized", success: false }); return; }

    if (requester.role === "branch_admin" || requester.role === "viewer") {
      res.status(403).json({ message: "Access denied", success: false }); return;
    }

    const { branchIds, password, ...rest } = req.body;

    if (requester.role === "regional_admin") {
      const targetRole = rest.role || "branch_admin";
      if (targetRole === "super_admin" || targetRole === "regional_admin") {
        res.status(403).json({ message: "You cannot assign this role", success: false }); return;
      }
      const myBranchSet = new Set(requester.branchIds);
      const filteredBranches = (branchIds || []).filter((id: number) => myBranchSet.has(id));
      const updates: any = { ...rest, branchIds: JSON.stringify(filteredBranches) };
      if (password) updates.passwordHash = hashPassword(password);
      const [user] = await db.update(systemUsers).set(updates).where(eq(systemUsers.id, Number(req.params.id))).returning();
      const names = await getBranchNames(filteredBranches);
      res.json(mapUser(user, names)); return;
    }

    const updates: any = { ...rest, branchIds: JSON.stringify(branchIds || []) };
    if (password) updates.passwordHash = hashPassword(password);
    const [user] = await db.update(systemUsers).set(updates).where(eq(systemUsers.id, Number(req.params.id))).returning();
    const names = await getBranchNames(branchIds || []);
    res.json(mapUser(user, names));
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

router.delete("/:id", async (req, res) => {
  try {
    const requester = await getRequester(req);
    if (!requester) { res.status(401).json({ message: "Unauthorized", success: false }); return; }

    if (requester.role === "branch_admin" || requester.role === "viewer") {
      res.status(403).json({ message: "Access denied", success: false }); return;
    }

    if (requester.role === "regional_admin") {
      const [target] = await db.select().from(systemUsers).where(eq(systemUsers.id, Number(req.params.id)));
      if (!target || target.role === "super_admin" || target.role === "regional_admin") {
        res.status(403).json({ message: "You cannot delete this user", success: false }); return;
      }
    }

    await db.delete(systemUsers).where(eq(systemUsers.id, Number(req.params.id)));
    res.json({ message: "Deleted", success: true });
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

export default router;

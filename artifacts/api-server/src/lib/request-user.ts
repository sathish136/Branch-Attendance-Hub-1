import { Request } from "express";
import { db } from "@workspace/db";
import { systemUsers } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "./auth.js";

export interface RequestUser {
  id: number;
  role: string;
  branchIds: number[];
  isSuper: boolean;
}

export async function getRequestUser(req: Request): Promise<RequestUser | null> {
  const token = (req.cookies?.["auth_token"]) || req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;

  const session = getSession(token);
  if (!session) return null;

  const userId = session.userId;

  if (userId === 0) {
    return { id: 0, role: "super_admin", branchIds: [], isSuper: true };
  }

  try {
    const [u] = await db.select().from(systemUsers).where(eq(systemUsers.id, userId));
    if (!u) return null;
    const branchIds: number[] = JSON.parse(u.branchIds || "[]");
    return { id: u.id, role: u.role, branchIds, isSuper: u.role === "super_admin" };
  } catch {
    return null;
  }
}

export function filterByBranch<T extends { branchId?: number | null; id?: number }>(
  items: T[],
  user: RequestUser | null
): T[] {
  if (!user || user.isSuper) return items;
  if (!user.branchIds.length) return [];
  const allowed = new Set(user.branchIds);
  return items.filter(item => item.branchId != null && allowed.has(item.branchId as number));
}

import { Router } from "express";
import { db } from "@workspace/db";
import { activityLogs, systemUsers } from "@workspace/db/schema";
import { desc, and, gte, lte, eq, ilike, or } from "drizzle-orm";
import { authMiddleware } from "../lib/auth.js";
import { logActivity } from "../lib/activity-logger.js";

const router = Router();

router.get("/", authMiddleware, async (req, res) => {
  try {
    const {
      limit = "100",
      offset = "0",
      action,
      username,
      status,
      module,
      dateFrom,
      dateTo,
      search,
    } = req.query as Record<string, string>;

    const conditions = [];

    if (action && action !== "all") conditions.push(eq(activityLogs.action, action));
    if (status && status !== "all") conditions.push(eq(activityLogs.status, status));
    if (module && module !== "all") conditions.push(eq(activityLogs.module, module));
    if (username) conditions.push(eq(activityLogs.username, username));
    if (dateFrom) conditions.push(gte(activityLogs.createdAt, new Date(dateFrom)));
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(activityLogs.createdAt, to));
    }
    if (search) {
      conditions.push(
        or(
          ilike(activityLogs.username, `%${search}%`),
          ilike(activityLogs.fullName, `%${search}%`),
          ilike(activityLogs.ipAddress, `%${search}%`),
          ilike(activityLogs.location, `%${search}%`),
          ilike(activityLogs.description, `%${search}%`),
        )
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select().from(activityLogs)
        .where(where)
        .orderBy(desc(activityLogs.createdAt))
        .limit(Number(limit))
        .offset(Number(offset)),
      db.select().from(activityLogs).where(where),
    ]);

    res.json({
      data: rows,
      total: countResult.length,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { action, module, description } = req.body;
    if (!action) {
      res.status(400).json({ message: "action required" });
      return;
    }
    const [user] = await db.select().from(systemUsers).where(eq(systemUsers.id, userId));
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    await logActivity({
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      action,
      module: module || null,
      description: description || null,
      status: "success",
      req,
    });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/clear", authMiddleware, async (req, res) => {
  try {
    const { before } = req.query as { before?: string };
    if (before) {
      const date = new Date(before);
      await db.delete(activityLogs).where(lte(activityLogs.createdAt, date));
    }
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;

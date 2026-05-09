import { Router } from "express";
import { db } from "@workspace/db";
import { systemUsers, branches } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  hashPassword,
  generateToken,
  createSession,
  deleteSession,
  authMiddleware,
  getSession,
} from "../lib/auth.js";
import { logActivity } from "../lib/activity-logger.js";

const router = Router();

const FALLBACK_USERS = [
  {
    id: 0,
    username: "admin",
    password: "Colombo@555",
    fullName: "Super Admin",
    email: "admin@slpost.lk",
    role: "super_admin" as const,
    branchIds: "[]",
    mustChangePassword: false,
  },
];

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ message: "Username and password required", success: false });
      return;
    }

    let user: any = null;

    const clientIp =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      req.ip ||
      "Unknown";

    try {
      const [dbUser] = await db.select().from(systemUsers).where(eq(systemUsers.username, username));
      user = dbUser;
    } catch {
      const fallback = FALLBACK_USERS.find(u => u.username === username && u.password === password);
      if (fallback) {
        const token = generateToken(fallback.id);
        createSession(token, fallback.id);
        res.cookie("auth_token", token, { httpOnly: true, maxAge: 8 * 60 * 60 * 1000, sameSite: "lax" });
        return res.json({
          success: true, token,
          mustChangePassword: fallback.mustChangePassword,
          lastLogin: null,
          loginIp: clientIp,
          user: { id: fallback.id, username: fallback.username, fullName: fallback.fullName, email: fallback.email, role: fallback.role, branchIds: [], branchNames: [], isActive: true },
        });
      }
      res.status(401).json({ message: "Invalid credentials", success: false });
      return;
    }

    if (!user || !user.isActive) {
      const fallback = FALLBACK_USERS.find(u => u.username === username && u.password === password);
      if (fallback) {
        const token = generateToken(fallback.id);
        createSession(token, fallback.id);
        res.cookie("auth_token", token, { httpOnly: true, maxAge: 8 * 60 * 60 * 1000, sameSite: "lax" });
        return res.json({
          success: true, token,
          mustChangePassword: fallback.mustChangePassword,
          lastLogin: null,
          loginIp: clientIp,
          user: { id: fallback.id, username: fallback.username, fullName: fallback.fullName, email: fallback.email, role: fallback.role, branchIds: [], branchNames: [], isActive: true },
        });
      }
      await logActivity({ username: username || "unknown", fullName: "", action: "login_failed", module: "Auth", description: `Failed login attempt for username: ${username}`, status: "failed", req });
      res.status(401).json({ message: "Invalid credentials", success: false });
      return;
    }

    const hash = hashPassword(password);
    if (user.passwordHash !== hash) {
      await logActivity({ userId: user.id, username: user.username, fullName: user.fullName, action: "login_failed", module: "Auth", description: `Incorrect password for user: ${user.username}`, status: "failed", req });
      res.status(401).json({ message: "Invalid credentials", success: false });
      return;
    }

    const previousLastLogin = user.lastLogin ?? null;

    const token = generateToken(user.id);
    createSession(token, user.id);
    await db.update(systemUsers).set({ lastLogin: new Date() }).where(eq(systemUsers.id, user.id));
    await logActivity({ userId: user.id, username: user.username, fullName: user.fullName, action: "login", module: "Auth", description: "User logged in successfully", sessionId: token.slice(0, 16), status: "success", req });

    const branchIds: number[] = JSON.parse(user.branchIds || "[]");
    let branchNames: string[] = [];
    if (branchIds.length > 0) {
      try {
        const branchRows = await db.select().from(branches).where(inArray(branches.id, branchIds));
        branchNames = branchIds.map(id => branchRows.find(b => b.id === id)?.name || "").filter(Boolean);
      } catch {}
    }
    res.cookie("auth_token", token, { httpOnly: true, maxAge: 8 * 60 * 60 * 1000, sameSite: "lax" });
    res.json({
      success: true, token,
      mustChangePassword: user.mustChangePassword ?? false,
      lastLogin: previousLastLogin,
      loginIp: clientIp,
      user: { id: user.id, username: user.username, fullName: user.fullName, email: user.email, role: user.role, branchIds, branchNames, isActive: user.isActive },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.post("/change-password", authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, message: "Current and new password are required." });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ success: false, message: "New password must be at least 6 characters." });
      return;
    }

    // Fallback user (id=0) has no DB record
    if (userId === 0) {
      res.status(400).json({ success: false, message: "Cannot change password for the default admin account." });
      return;
    }

    const [user] = await db.select().from(systemUsers).where(eq(systemUsers.id, userId));
    if (!user) { res.status(404).json({ success: false, message: "User not found." }); return; }

    if (user.passwordHash !== hashPassword(currentPassword)) {
      res.status(400).json({ success: false, message: "Current password is incorrect." });
      return;
    }

    await db.update(systemUsers).set({
      passwordHash: hashPassword(newPassword),
      mustChangePassword: false,
    }).where(eq(systemUsers.id, userId));

    res.json({ success: true, message: "Password changed successfully." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

router.post("/logout", async (req, res) => {
  const token = req.cookies?.["auth_token"] || req.headers.authorization?.replace("Bearer ", "");
  if (token) {
    const session = getSession(token);
    if (session) {
      try {
        const [user] = await db.select().from(systemUsers).where(eq(systemUsers.id, session.userId));
        if (user) {
          await logActivity({ userId: user.id, username: user.username, fullName: user.fullName, action: "logout", module: "Auth", description: "User logged out", sessionId: token.slice(0, 16), status: "success", req });
        }
      } catch {}
    }
    deleteSession(token);
  }
  res.clearCookie("auth_token");
  res.json({ message: "Logged out", success: true });
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const [user] = await db.select().from(systemUsers).where(eq(systemUsers.id, userId));
    if (!user) { res.status(404).json({ message: "Not found", success: false }); return; }
    const branchIds: number[] = JSON.parse(user.branchIds || "[]");
    res.json({ id: user.id, username: user.username, fullName: user.fullName, email: user.email, role: user.role, branchIds, branchNames: [], isActive: user.isActive });
  } catch (e) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

export default router;

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "salt_po_2024").digest("hex");
}

export function generateToken(userId: number): string {
  return crypto.createHash("sha256").update(`${userId}-${Date.now()}-po_secret`).digest("hex");
}

const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours
const WORKSPACE = process.env.REPL_HOME || "/home/runner/workspace";
const SESSIONS_FILE = join(WORKSPACE, ".sessions.json");

type SessionMap = Record<string, { userId: number; expiresAt: number }>;

function loadSessions(): SessionMap {
  try {
    const raw = readFileSync(SESSIONS_FILE, "utf-8");
    const parsed: SessionMap = JSON.parse(raw);
    const now = Date.now();
    const alive: SessionMap = {};
    for (const [token, s] of Object.entries(parsed)) {
      if (s.expiresAt > now) alive[token] = s;
    }
    return alive;
  } catch {
    return {};
  }
}

function saveSessions(sessions: SessionMap) {
  try {
    mkdirSync(WORKSPACE, { recursive: true });
    writeFileSync(SESSIONS_FILE, JSON.stringify(sessions), "utf-8");
  } catch {}
}

let activeSessions: SessionMap = loadSessions();

export function createSession(token: string, userId: number) {
  activeSessions[token] = { userId, expiresAt: Date.now() + SESSION_TTL };
  saveSessions(activeSessions);
}

export function getSession(token: string): { userId: number } | null {
  const session = activeSessions[token];
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    delete activeSessions[token];
    saveSessions(activeSessions);
    return null;
  }
  return { userId: session.userId };
}

export function deleteSession(token: string) {
  delete activeSessions[token];
  saveSessions(activeSessions);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.["auth_token"] || req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ message: "Unauthorized", success: false });
    return;
  }
  const session = getSession(token);
  if (!session) {
    res.status(401).json({ message: "Session expired", success: false });
    return;
  }
  (req as any).userId = session.userId;
  next();
}

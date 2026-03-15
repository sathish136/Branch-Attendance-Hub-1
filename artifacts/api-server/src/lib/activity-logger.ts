import { db } from "@workspace/db";
import { activityLogs } from "@workspace/db/schema";
import type { Request } from "express";

function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const first = Array.isArray(xff) ? xff[0] : xff.split(",")[0];
    return first.trim();
  }
  return req.socket?.remoteAddress || req.ip || "unknown";
}

async function fetchLocation(ip: string): Promise<string> {
  if (!ip || ip === "unknown" || ip === "::1" || ip.startsWith("127.") || ip.startsWith("172.") || ip.startsWith("10.") || ip.startsWith("192.168.")) {
    return "Local / Internal";
  }
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=country,city,regionName,status`, { signal: AbortSignal.timeout(2000) });
    const data = await res.json() as { status: string; city?: string; regionName?: string; country?: string };
    if (data.status === "success") {
      return [data.city, data.regionName, data.country].filter(Boolean).join(", ");
    }
  } catch {
    // ignore
  }
  return ip;
}

export interface LogOptions {
  userId?: number | null;
  username: string;
  fullName?: string;
  action: string;
  module?: string;
  description?: string;
  sessionId?: string;
  status?: "success" | "failed";
  req: Request;
}

export async function logActivity(opts: LogOptions): Promise<void> {
  try {
    const ip = getClientIp(opts.req);
    const userAgent = opts.req.headers["user-agent"] || null;
    const location = await fetchLocation(ip);
    await db.insert(activityLogs).values({
      userId: opts.userId ?? null,
      username: opts.username,
      fullName: opts.fullName ?? "",
      action: opts.action,
      module: opts.module ?? null,
      description: opts.description ?? null,
      ipAddress: ip,
      userAgent: userAgent,
      location: location,
      sessionId: opts.sessionId ?? null,
      status: opts.status ?? "success",
    });
  } catch (e) {
    console.error("Activity log error:", e);
  }
}

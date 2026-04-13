import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { biometricDevices, biometricLogs, employees } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

router.use((_req, res, next) => {
  res.setHeader("Content-Type", "text/plain");
  next();
});

function nowStamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

async function findOrNoteDevice(sn: string, ip: string): Promise<typeof biometricDevices.$inferSelect> {
  const [dev] = await db.select().from(biometricDevices)
    .where(eq(biometricDevices.serialNumber, sn));

  if (dev) {
    await db.update(biometricDevices)
      .set({ status: "online", lastSync: new Date(), ipAddress: ip || dev.ipAddress })
      .where(eq(biometricDevices.id, dev.id));
    return { ...dev, status: "online", lastSync: new Date(), ipAddress: ip || dev.ipAddress };
  }

  const [created] = await db.insert(biometricDevices).values({
    name: `Device ${sn}`,
    serialNumber: sn,
    model: "ZKTeco",
    ipAddress: ip || "",
    port: 4370,
    branchId: null,
    pushMethod: "zkpush",
    status: "online",
    lastSync: new Date(),
    isActive: true,
  }).returning();
  return created;
}

router.get("/cdata", async (req: Request, res: Response) => {
  const sn = (req.query.SN as string) || "";
  const options = (req.query.options as string) || "";
  const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";

  if (!sn) { res.send("ERROR"); return; }

  await findOrNoteDevice(sn, ip);

  if (options === "all") {
    res.send(
      `GET OPTION FROM:${sn}\n` +
      `OPTION:Stamp=${nowStamp()}\n` +
      `OPTION:ServerVer=2.4.1\n` +
      `OPTION:PushProtVer=2.4.1\n` +
      `OPTION:PushOptionsFlag=1\n` +
      `ATT\n`
    );
    return;
  }

  res.send(`OK`);
});

router.post("/cdata", async (req: Request, res: Response) => {
  const sn = (req.query.SN as string) || "";
  const table = (req.query.table as string) || "";
  const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";

  if (!sn) { res.send("ERROR"); return; }

  const dev = await findOrNoteDevice(sn, ip);

  if (table === "ATTLOG") {
    const body = typeof req.body === "string" ? req.body : "";
    const lines = body.split("\n").map(l => l.trim()).filter(Boolean);
    let count = 0;

    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length < 3) continue;

      const [biometricId, , datetimeStr] = parts;
      const statusCode = parts[1];

      let punchType: "in" | "out" | "unknown" = "unknown";
      if (statusCode === "0") punchType = "in";
      else if (statusCode === "1") punchType = "out";

      let punchTime: Date;
      try {
        punchTime = new Date(datetimeStr.replace(" ", "T"));
        if (isNaN(punchTime.getTime())) continue;
      } catch { continue; }

      const existing = await db.select().from(biometricLogs)
        .where(and(
          eq(biometricLogs.deviceId, dev.id),
          eq(biometricLogs.biometricId, biometricId),
          eq(biometricLogs.punchTime, punchTime),
        ));
      if (existing.length > 0) continue;

      const [emp] = await db.select().from(employees)
        .where(eq(employees.biometricId, biometricId));

      await db.insert(biometricLogs).values({
        deviceId: dev.id,
        employeeId: emp?.id || null,
        biometricId,
        punchTime,
        punchType,
        processed: false,
      });
      count++;
    }

    res.send(`OK: ${count}`);
    return;
  }

  res.send("OK");
});

router.get("/getrequest", async (req: Request, res: Response) => {
  const sn = (req.query.SN as string) || "";
  const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";
  if (sn) await findOrNoteDevice(sn, ip);
  res.send("OK");
});

router.post("/devicecmd", async (_req: Request, res: Response) => {
  res.send("OK");
});

export default router;

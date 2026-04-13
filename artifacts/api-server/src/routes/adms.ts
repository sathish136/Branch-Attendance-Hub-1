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

async function findOrNoteDevice(sn: string, ip: string): Promise<typeof biometricDevices.$inferSelect | null> {
  try {
    const [dev] = await db.select().from(biometricDevices)
      .where(eq(biometricDevices.serialNumber, sn));

    if (dev) {
      await db.update(biometricDevices)
        .set({ status: "online", lastSync: new Date(), ipAddress: ip || dev.ipAddress })
        .where(eq(biometricDevices.id, dev.id));
      console.log(`[ADMS] Device updated: SN=${sn} IP=${ip}`);
      return { ...dev, status: "online", lastSync: new Date(), ipAddress: ip || dev.ipAddress };
    }

    const [created] = await db.insert(biometricDevices).values({
      name: `Device ${sn}`,
      serialNumber: sn,
      model: "ZKTeco",
      ipAddress: ip || "",
      port: 3333,
      branchId: null,
      pushMethod: "zkpush",
      status: "online",
      lastSync: new Date(),
      isActive: true,
    }).returning();
    console.log(`[ADMS] New device registered: SN=${sn} IP=${ip} id=${created.id}`);
    return created;
  } catch (err) {
    console.error(`[ADMS] DB error for SN=${sn}:`, err);
    return null;
  }
}

/**
 * Parse a single ZKTeco ATTLOG line.
 * ZKTeco sends two possible formats:
 *   Format A: PIN\tDATE\tTIME\tSTATUS\tVERIFY\tWORKCODE  (date/time separate)
 *   Format B: PIN\tDATETIME\tSTATUS\tVERIFY\tWORKCODE    (datetime combined)
 */
function parseAttlogLine(line: string): { biometricId: string; datetimeStr: string; statusCode: string } | null {
  const parts = line.split("\t");
  if (parts.length < 3) return null;

  const biometricId = parts[0].trim();
  if (!biometricId) return null;

  let datetimeStr: string;
  let statusCode: string;

  // Format A: parts[1] = "YYYY-MM-DD", parts[2] = "HH:MM:SS"
  if (/^\d{4}-\d{2}-\d{2}$/.test(parts[1]) && /^\d{2}:\d{2}:\d{2}$/.test(parts[2] || "")) {
    datetimeStr = `${parts[1]} ${parts[2]}`;
    statusCode = (parts[3] || "0").trim();
  } else {
    // Format B: parts[1] = "YYYY-MM-DD HH:MM:SS", parts[2] = status
    datetimeStr = parts[1].trim();
    statusCode = (parts[2] || "0").trim();
  }

  return { biometricId, datetimeStr, statusCode };
}

router.get("/cdata", async (req: Request, res: Response) => {
  const sn = (req.query.SN as string) || "";
  const options = (req.query.options as string) || "";
  const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";

  console.log(`[ADMS] GET /cdata SN=${sn} options=${options} ip=${ip}`);

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

  console.log(`[ADMS] POST /cdata SN=${sn} table=${table} ip=${ip}`);

  if (!sn) { res.send("ERROR"); return; }

  const dev = await findOrNoteDevice(sn, ip);

  if (!dev) {
    console.error(`[ADMS] Could not register device SN=${sn}, still responding OK to device`);
    res.send("OK");
    return;
  }

  if (table === "ATTLOG") {
    const body = typeof req.body === "string" ? req.body : "";
    const lines = body.split("\n").map((l: string) => l.trim()).filter(Boolean);
    let count = 0;

    for (const line of lines) {
      try {
        const parsed = parseAttlogLine(line);
        if (!parsed) continue;

        const { biometricId, datetimeStr, statusCode } = parsed;

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
      } catch (lineErr) {
        console.error(`[ADMS] Error processing ATTLOG line: "${line}"`, lineErr);
      }
    }

    console.log(`[ADMS] ATTLOG: saved ${count} records for SN=${sn}`);
    res.send(`OK: ${count}`);
    return;
  }

  if (table === "OPERLOG") {
    console.log(`[ADMS] OPERLOG received for SN=${sn} (ignored)`);
    res.send("OK");
    return;
  }

  res.send("OK");
});

router.get("/getrequest", async (req: Request, res: Response) => {
  const sn = (req.query.SN as string) || "";
  const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";
  console.log(`[ADMS] GET /getrequest SN=${sn}`);
  if (sn) await findOrNoteDevice(sn, ip);
  res.send("OK");
});

router.post("/devicecmd", async (_req: Request, res: Response) => {
  res.send("OK");
});

export default router;

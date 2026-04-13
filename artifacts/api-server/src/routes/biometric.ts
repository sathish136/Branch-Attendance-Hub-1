import { Router } from "express";
import { db } from "@workspace/db";
import { biometricDevices, biometricLogs, branches, employees, attendanceRecords } from "@workspace/db/schema";
import { eq, and, isNull, inArray, isNotNull } from "drizzle-orm";
import { autoCreateEmployees, autoSync } from "../lib/biometric-sync.js";

const router = Router();

router.get("/devices", async (_req, res) => {
  try {
    const all = await db.select({
      dev: biometricDevices,
      branchName: branches.name,
    }).from(biometricDevices).leftJoin(branches, eq(biometricDevices.branchId, branches.id));
    res.json(all.map(r => ({
      ...r.dev,
      branchName: r.branchName || "",
      totalPushLogs: 0,
      lastSync: r.dev.lastSync?.toISOString() || null,
      createdAt: r.dev.createdAt.toISOString(),
    })));
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

router.post("/devices", async (req, res) => {
  try {
    const [dev] = await db.insert(biometricDevices).values(req.body).returning();
    const [br] = await db.select().from(branches).where(eq(branches.id, dev.branchId));
    res.status(201).json({ ...dev, branchName: br?.name || "", totalPushLogs: 0, lastSync: null, createdAt: dev.createdAt.toISOString() });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.put("/devices/:id", async (req, res) => {
  try {
    const devId = Number(req.params.id);
    const [before] = await db.select().from(biometricDevices).where(eq(biometricDevices.id, devId));

    const [dev] = await db.update(biometricDevices).set(req.body).where(eq(biometricDevices.id, devId)).returning();
    const [br] = await db.select().from(branches).where(eq(branches.id, dev.branchId));

    let employeesCreated = 0;
    const newBranchId = req.body.branchId;
    if (newBranchId) {
      autoSync(devId, Number(newBranchId));
    } else if (dev.branchId) {
      autoSync(devId, dev.branchId);
    }

    res.json({
      ...dev,
      branchName: br?.name || "",
      totalPushLogs: 0,
      lastSync: dev.lastSync?.toISOString() || null,
      createdAt: dev.createdAt.toISOString(),
      employeesCreated,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.delete("/devices/:id", async (req, res) => {
  try {
    const devId = Number(req.params.id);
    await db.delete(biometricLogs).where(eq(biometricLogs.deviceId, devId));
    await db.delete(biometricDevices).where(eq(biometricDevices.id, devId));
    res.json({ message: "Deleted", success: true });
  } catch (e: any) {
    console.error("Delete device error:", e?.message || e);
    res.status(500).json({ message: e?.message || "Error deleting device", success: false });
  }
});

router.post("/devices/:id/test", async (req, res) => {
  try {
    const [dev] = await db.select().from(biometricDevices).where(eq(biometricDevices.id, Number(req.params.id)));
    if (!dev) { res.status(404).json({ success: false, message: "Device not found" }); return; }
    const simLatency = Math.floor(Math.random() * 100) + 20;
    res.json({ success: true, message: `Connected to ${dev.ipAddress}:${dev.port} (simulated)`, latencyMs: simLatency });
  } catch (e) { res.status(500).json({ success: false, message: "Test failed" }); }
});


router.post("/sync-users", async (req, res) => {
  try {
    const users: Array<{ sn: string; pin: string; name: string }> = req.body.users || [];
    let updated = 0;

    for (const u of users) {
      if (!u.pin || !u.name?.trim()) continue;
      const [emp] = await db.select().from(employees).where(eq(employees.biometricId, u.pin));
      if (!emp) continue;

      const name = u.name.trim();
      const parts = name.split(" ");
      const firstName = parts[0] || name;
      const lastName = parts.slice(1).join(" ") || null;

      await db.update(employees).set({
        fullName: name,
        firstName,
        lastName,
      }).where(eq(employees.id, emp.id));

      updated++;
    }

    res.json({ success: true, updated });
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: "Sync failed" }); }
});

router.post("/push-device", async (req, res) => {
  try {
    const { serialNumber, ipAddress, pushver } = req.body as {
      serialNumber: string;
      ipAddress?: string;
      pushver?: string;
    };
    if (!serialNumber) { res.status(400).json({ success: false, message: "serialNumber required" }); return; }

    const [existing] = await db.select().from(biometricDevices)
      .where(eq(biometricDevices.serialNumber, serialNumber));

    if (existing) {
      await db.update(biometricDevices)
        .set({ status: "online", lastSync: new Date(), ipAddress: ipAddress || existing.ipAddress })
        .where(eq(biometricDevices.id, existing.id));
      res.json({ success: true, deviceId: existing.id, action: "updated" });
    } else {
      const [created] = await db.insert(biometricDevices).values({
        name: `Device ${serialNumber}`,
        serialNumber,
        model: "ZKTeco",
        ipAddress: ipAddress || "",
        port: 3333,
        branchId: null,
        pushMethod: "zkpush",
        status: "online",
        lastSync: new Date(),
        isActive: true,
      }).returning();
      res.status(201).json({ success: true, deviceId: created.id, action: "created" });
    }
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: "Error" }); }
});

router.post("/push-logs", async (req, res) => {
  try {
    const { sn, records } = req.body as {
      sn: string;
      records: Array<{ pin: string; time: string; status: string; verify?: string; workcode?: string }>;
    };
    if (!sn || !Array.isArray(records)) {
      res.status(400).json({ success: false, message: "sn and records[] required" }); return;
    }

    const [dev] = await db.select().from(biometricDevices)
      .where(eq(biometricDevices.serialNumber, sn));
    if (!dev) {
      res.status(404).json({ success: false, message: "Device not found — call push-device first" }); return;
    }

    let inserted = 0;
    for (const r of records) {
      const { pin, time: timeStr, status: statusCode } = r;
      if (!pin || !timeStr) continue;

      let punchTime: Date;
      try {
        punchTime = new Date(timeStr.replace(" ", "T") + "+05:30");
        if (isNaN(punchTime.getTime())) continue;
      } catch { continue; }

      const punchType = statusCode === "0" ? "in" : statusCode === "1" ? "out" : "unknown";

      const [existing] = await db.select({ id: biometricLogs.id }).from(biometricLogs)
        .where(and(
          eq(biometricLogs.deviceId, dev.id),
          eq(biometricLogs.biometricId, pin),
          eq(biometricLogs.punchTime, punchTime),
        ));
      if (existing) continue;

      const [emp] = await db.select({ id: employees.id }).from(employees)
        .where(
          dev.branchId
            ? and(eq(employees.biometricId, pin), eq(employees.branchId, dev.branchId))
            : eq(employees.biometricId, pin)
        );

      await db.insert(biometricLogs).values({
        deviceId: dev.id,
        employeeId: emp?.id || null,
        biometricId: pin,
        punchTime,
        punchType: punchType as "in" | "out" | "unknown",
        processed: false,
      });
      inserted++;
    }

    res.json({ success: true, inserted });

    if (inserted > 0 && dev.branchId) {
      autoSync(dev.id, dev.branchId);
    }
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: "Error" }); }
});

// POST /api/biometric/sync-users
// Called by push.py to sync employee names from ZKTeco device user data.
// Body: { users: [{ pin: string, name: string, sn?: string }] }
router.post("/sync-users", async (req, res) => {
  try {
    const { users } = req.body as { users: Array<{ pin: string; name: string; sn?: string }> };
    if (!Array.isArray(users)) {
      res.status(400).json({ success: false, message: "users[] required" }); return;
    }
    let updated = 0;
    for (const u of users) {
      const pin = String(u.pin || "").trim();
      const name = (u.name || "").trim();
      if (!pin || !name) continue;

      const [emp] = await db.select().from(employees).where(eq(employees.biometricId, pin));
      if (!emp) continue;

      await db.update(employees)
        .set({ fullName: name })
        .where(eq(employees.biometricId, pin));
      updated++;
      console.log(`[BioSync] Name updated for PIN=${pin}: "${name}"`);
    }
    res.json({ success: true, updated });
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: "Error" }); }
});

router.delete("/logs", async (req, res) => {
  try {
    const { deviceId } = req.query;
    if (deviceId) {
      await db.delete(biometricLogs).where(eq(biometricLogs.deviceId, Number(deviceId)));
    } else {
      await db.delete(biometricLogs);
    }
    res.json({ success: true, message: "Logs cleared" });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.get("/logs", async (req, res) => {
  try {
    const { deviceId, startDate, endDate, page = "1" } = req.query;
    const all = await db.select({
      log: biometricLogs,
      deviceName: biometricDevices.name,
      empName: employees.fullName,
    }).from(biometricLogs)
      .leftJoin(biometricDevices, eq(biometricLogs.deviceId, biometricDevices.id))
      .leftJoin(employees, eq(biometricLogs.employeeId, employees.id));

    let filtered = all;
    if (deviceId) filtered = filtered.filter(r => r.log.deviceId === Number(deviceId));
    if (startDate) {
      const start = new Date(String(startDate));
      filtered = filtered.filter(r => r.log.punchTime >= start);
    }
    if (endDate) {
      const end = new Date(String(endDate));
      end.setDate(end.getDate() + 1);
      filtered = filtered.filter(r => r.log.punchTime < end);
    }

    const total = filtered.length;
    const p = Number(page), l = 50;
    const paginated = filtered.slice((p - 1) * l, p * l);

    res.json({
      logs: paginated.map(r => ({
        ...r.log,
        deviceName: r.deviceName || "",
        employeeId: r.log.employeeId || 0,
        employeeName: r.empName || "Unknown",
        punchTime: r.log.punchTime.toISOString(),
        createdAt: r.log.createdAt.toISOString(),
      })),
      total, page: p,
    });
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

export default router;

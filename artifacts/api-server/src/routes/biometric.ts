import { Router } from "express";
import { db } from "@workspace/db";
import { biometricDevices, biometricLogs, branches, employees, attendanceRecords } from "@workspace/db/schema";
import { eq, and, isNull, inArray, isNotNull } from "drizzle-orm";

const router = Router();

async function getRegionalInfo(branchId: number) {
  const [branch] = await db.select().from(branches).where(eq(branches.id, branchId));
  if (!branch) return null;
  if (branch.type === "regional") {
    return { regionalCode: branch.code, regionalId: branch.id };
  }
  if (branch.type === "sub_branch" && branch.parentId) {
    const [parent] = await db.select().from(branches).where(eq(branches.id, branch.parentId));
    if (parent && parent.type === "regional") {
      return { regionalCode: parent.code, regionalId: parent.id };
    }
  }
  if (branch.type === "head_office") {
    return { regionalCode: branch.code, regionalId: branch.id };
  }
  return null;
}

async function getBranchIdsInRegion(regionalId: number): Promise<number[]> {
  const allBranches = await db.select({ id: branches.id, parentId: branches.parentId }).from(branches);
  const ids: number[] = [regionalId];
  for (const b of allBranches) {
    if (b.parentId === regionalId) ids.push(b.id);
  }
  return ids;
}

async function generateNextEmployeeId(branchId: number): Promise<string> {
  const regional = await getRegionalInfo(branchId);
  if (!regional) {
    const count = await db.select({ id: employees.id }).from(employees);
    return `EMP${String(count.length + 1).padStart(4, "0")}`;
  }
  const prefix = regional.regionalCode.toUpperCase();
  const branchIds = await getBranchIdsInRegion(regional.regionalId);
  const existing = await db.select({ employeeId: employees.employeeId })
    .from(employees)
    .where(inArray(employees.branchId, branchIds));

  let maxNum = 0;
  for (const e of existing) {
    const id = e.employeeId.toUpperCase();
    if (id.startsWith(prefix)) {
      const numPart = parseInt(id.slice(prefix.length), 10);
      if (!isNaN(numPart) && numPart > maxNum) maxNum = numPart;
    }
  }
  return `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
}

async function autoCreateEmployeesForDevice(deviceId: number, branchId: number) {
  const logs = await db.select({
    biometricId: biometricLogs.biometricId,
  }).from(biometricLogs)
    .where(and(eq(biometricLogs.deviceId, deviceId), isNull(biometricLogs.employeeId)));

  const uniqueIds = [...new Set(logs.map(l => l.biometricId))];
  if (uniqueIds.length === 0) return 0;

  const today = new Date().toISOString().split("T")[0];
  let created = 0;

  for (const bioId of uniqueIds) {
    try {
      const [existing] = await db.select().from(employees)
        .where(eq(employees.biometricId, bioId));
      if (existing) {
        await db.update(biometricLogs)
          .set({ employeeId: existing.id })
          .where(and(eq(biometricLogs.deviceId, deviceId), eq(biometricLogs.biometricId, bioId)));
        continue;
      }

      const empId = await generateNextEmployeeId(branchId);

      const [newEmp] = await db.insert(employees).values({
        employeeId: empId,
        fullName: `Employee ${bioId}`,
        firstName: null,
        lastName: null,
        designation: "Staff",
        department: "General",
        branchId,
        joiningDate: today,
        email: `${empId.toLowerCase()}@postal.lk`,
        phone: "",
        biometricId: bioId,
        status: "active",
        employeeType: "permanent",
      }).returning();

      await db.update(biometricLogs)
        .set({ employeeId: newEmp.id })
        .where(and(eq(biometricLogs.deviceId, deviceId), eq(biometricLogs.biometricId, bioId)));

      created++;
      console.log(`[Biometric] Auto-created employee ${empId} for biometricId=${bioId}`);
    } catch (err) {
      console.error(`[Biometric] Failed to create employee for biometricId=${bioId}:`, err);
    }
  }

  return created;
}

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
    if (newBranchId && (!before?.branchId || before.branchId !== newBranchId)) {
      employeesCreated = await autoCreateEmployeesForDevice(devId, Number(newBranchId));
      console.log(`[Biometric] Branch assigned to device ${devId}: created ${employeesCreated} employees`);
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
    await db.delete(biometricDevices).where(eq(biometricDevices.id, Number(req.params.id)));
    res.json({ message: "Deleted", success: true });
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

router.post("/devices/:id/test", async (req, res) => {
  try {
    const [dev] = await db.select().from(biometricDevices).where(eq(biometricDevices.id, Number(req.params.id)));
    if (!dev) { res.status(404).json({ success: false, message: "Device not found" }); return; }
    const simLatency = Math.floor(Math.random() * 100) + 20;
    res.json({ success: true, message: `Connected to ${dev.ipAddress}:${dev.port} (simulated)`, latencyMs: simLatency });
  } catch (e) { res.status(500).json({ success: false, message: "Test failed" }); }
});

router.post("/devices/:id/create-employees", async (req, res) => {
  try {
    const devId = Number(req.params.id);
    const [dev] = await db.select().from(biometricDevices).where(eq(biometricDevices.id, devId));
    if (!dev) { res.status(404).json({ success: false, message: "Device not found" }); return; }
    if (!dev.branchId) { res.status(400).json({ success: false, message: "Assign a branch to this device first" }); return; }

    const count = await autoCreateEmployeesForDevice(devId, dev.branchId);
    res.json({ success: true, message: `Created ${count} employees from device logs`, employeesCreated: count });
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: "Failed to create employees" }); }
});

function calcHours(t1: string | null | undefined, t2: string | null | undefined): number | null {
  if (!t1 || !t2) return null;
  const d1 = new Date(t1), d2 = new Date(t2);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
  const diff = (d2.getTime() - d1.getTime()) / 3600000;
  return diff > 0 ? Math.round(diff * 100) / 100 : null;
}

router.post("/devices/:id/sync-attendance", async (req, res) => {
  try {
    const devId = Number(req.params.id);
    const [dev] = await db.select().from(biometricDevices).where(eq(biometricDevices.id, devId));
    if (!dev) { res.status(404).json({ success: false, message: "Device not found" }); return; }
    if (!dev.branchId) { res.status(400).json({ success: false, message: "Assign a branch to this device first" }); return; }

    // Step 1: auto-create any missing employees from logs
    const empCreated = await autoCreateEmployeesForDevice(devId, dev.branchId);

    // Step 2: load all logs with a linked employee (processed or not — we upsert attendance)
    const logs = await db.select({
      id: biometricLogs.id,
      employeeId: biometricLogs.employeeId,
      punchTime: biometricLogs.punchTime,
      punchType: biometricLogs.punchType,
    }).from(biometricLogs)
      .where(and(eq(biometricLogs.deviceId, devId), isNotNull(biometricLogs.employeeId)));

    // Step 3: group by employeeId + date
    const byEmpDate = new Map<string, typeof logs>();
    for (const log of logs) {
      const dateStr = log.punchTime.toISOString().split("T")[0];
      const key = `${log.employeeId}_${dateStr}`;
      if (!byEmpDate.has(key)) byEmpDate.set(key, []);
      byEmpDate.get(key)!.push(log);
    }

    let attCreated = 0, attUpdated = 0;

    for (const [key, group] of byEmpDate.entries()) {
      const [empIdStr, dateStr] = key.split("_");
      const empId = Number(empIdStr);
      const sorted = [...group].sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime());

      // First punch = in, last punch = out (if different from first)
      const firstPunch = sorted[0].punchTime.toISOString();
      const lastPunch  = sorted.length > 1 ? sorted[sorted.length - 1].punchTime.toISOString() : null;

      const [emp] = await db.select({ branchId: employees.branchId }).from(employees).where(eq(employees.id, empId));
      const branchId = emp?.branchId ?? dev.branchId;

      const [existing] = await db.select().from(attendanceRecords)
        .where(and(eq(attendanceRecords.employeeId, empId), eq(attendanceRecords.date, dateStr)));

      if (!existing) {
        const wh1 = lastPunch ? calcHours(firstPunch, lastPunch) : null;
        await db.insert(attendanceRecords).values({
          employeeId: empId,
          branchId,
          date: dateStr,
          status: "present",
          inTime1: firstPunch,
          outTime1: lastPunch ?? null,
          workHours1: wh1,
          totalHours: wh1,
          source: "biometric",
        });
        attCreated++;
      } else {
        // Fill gaps: update inTime1 if missing, outTime1 if missing or extend with later punch
        const updates: Record<string, any> = { source: "biometric", status: "present", updatedAt: new Date() };
        if (!existing.inTime1) updates.inTime1 = firstPunch;
        const currentOut = existing.outTime1 ? new Date(existing.outTime1) : null;
        const newOut     = lastPunch ? new Date(lastPunch) : null;
        if (newOut && (!currentOut || newOut > currentOut)) updates.outTime1 = lastPunch;
        const wh1 = calcHours(updates.inTime1 ?? existing.inTime1, updates.outTime1 ?? existing.outTime1);
        if (wh1 !== null) { updates.workHours1 = wh1; updates.totalHours = wh1; }
        await db.update(attendanceRecords).set(updates).where(eq(attendanceRecords.id, existing.id));
        attUpdated++;
      }

      // Mark all logs in this group as processed
      await db.update(biometricLogs).set({ processed: true })
        .where(inArray(biometricLogs.id, group.map(l => l.id)));
    }

    console.log(`[Sync] Device ${devId}: empCreated=${empCreated} attCreated=${attCreated} attUpdated=${attUpdated}`);
    res.json({ success: true, employeesCreated: empCreated, attendanceCreated: attCreated, attendanceUpdated: attUpdated });
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: "Sync failed" }); }
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
        .where(eq(employees.biometricId, pin));

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
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: "Error" }); }
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

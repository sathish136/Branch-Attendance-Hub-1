import { db } from "@workspace/db";
import { biometricDevices, biometricLogs, employees, attendanceRecords, branches } from "@workspace/db/schema";
import { eq, and, isNull, isNotNull, inArray, sql } from "drizzle-orm";

function calcHours(t1: string | null | undefined, t2: string | null | undefined): number | null {
  if (!t1 || !t2) return null;
  const d1 = new Date(t1), d2 = new Date(t2);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
  const diff = (d2.getTime() - d1.getTime()) / 3600000;
  return diff > 0 ? Math.round(diff * 100) / 100 : null;
}

async function getRegionalInfo(branchId: number) {
  const [branch] = await db.select().from(branches).where(eq(branches.id, branchId));
  if (!branch) return null;
  if (branch.type === "regional") return { regionalCode: branch.code, regionalId: branch.id };
  if (branch.type === "sub_branch" && branch.parentId) {
    const [parent] = await db.select().from(branches).where(eq(branches.id, branch.parentId));
    if (parent?.type === "regional") return { regionalCode: parent.code, regionalId: parent.id };
  }
  if (branch.type === "head_office") return { regionalCode: branch.code, regionalId: branch.id };
  return null;
}

async function generateNextEmployeeId(branchId: number): Promise<string> {
  const regional = await getRegionalInfo(branchId);
  if (!regional) {
    const all = await db.select({ id: employees.id }).from(employees);
    return `EMP${String(all.length + 1).padStart(4, "0")}`;
  }
  const prefix = regional.regionalCode.toUpperCase();
  const allBranches = await db.select({ id: branches.id, parentId: branches.parentId }).from(branches);
  const ids: number[] = [regional.regionalId];
  for (const b of allBranches) { if (b.parentId === regional.regionalId) ids.push(b.id); }
  const existing = await db.select({ employeeId: employees.employeeId }).from(employees)
    .where(inArray(employees.branchId, ids));
  let maxNum = 0;
  for (const e of existing) {
    const id = e.employeeId.toUpperCase();
    if (id.startsWith(prefix)) {
      // Strip prefix and any leading dash/hyphen before parsing number
      const numStr = id.slice(prefix.length).replace(/^[-_]/, "");
      const n = parseInt(numStr, 10);
      if (!isNaN(n) && n > 0 && n > maxNum) maxNum = n;
    }
  }
  return `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
}

export async function autoCreateEmployees(deviceId: number, branchId: number): Promise<number> {
  const logs = await db.select({ biometricId: biometricLogs.biometricId })
    .from(biometricLogs)
    .where(and(eq(biometricLogs.deviceId, deviceId), isNull(biometricLogs.employeeId)));

  const uniqueIds = [...new Set(logs.map(l => l.biometricId))];
  if (uniqueIds.length === 0) return 0;

  const today = new Date().toISOString().split("T")[0];
  let created = 0;

  for (const bioId of uniqueIds) {
    try {
      // Re-check existence right before insert to guard against race conditions
      const [existing] = await db.select().from(employees).where(eq(employees.biometricId, bioId));
      if (existing) {
        await db.update(biometricLogs).set({ employeeId: existing.id })
          .where(and(eq(biometricLogs.deviceId, deviceId), eq(biometricLogs.biometricId, bioId)));
        continue;
      }

      const empId = await generateNextEmployeeId(branchId);

      // Double-check: make sure this biometricId wasn't created concurrently
      const [existingAfter] = await db.select().from(employees).where(eq(employees.biometricId, bioId));
      if (existingAfter) {
        await db.update(biometricLogs).set({ employeeId: existingAfter.id })
          .where(and(eq(biometricLogs.deviceId, deviceId), eq(biometricLogs.biometricId, bioId)));
        continue;
      }

      // Insert employee; the partial unique index on biometric_id prevents duplicates at DB level
      let newEmpId: number;
      try {
        const result = await db.execute(
          sql`INSERT INTO employees (employee_id, full_name, first_name, last_name, designation, department, branch_id, joining_date, email, phone, biometric_id, status, employee_type)
              VALUES (${empId}, ${'Employee ' + bioId}, ${null}, ${null}, ${'Staff'}, ${'General'}, ${branchId}, ${today}, ${empId.toLowerCase() + '@postal.lk'}, ${''}, ${bioId}, ${'active'}, ${'permanent'})
              ON CONFLICT (biometric_id) WHERE biometric_id IS NOT NULL DO NOTHING
              RETURNING id`
        );
        const rows = (result as any).rows ?? result;
        if (!rows || rows.length === 0) {
          // Conflict: employee already created by a concurrent sync
          const [conflicting] = await db.select().from(employees).where(eq(employees.biometricId, bioId));
          if (conflicting) {
            await db.update(biometricLogs).set({ employeeId: conflicting.id })
              .where(and(eq(biometricLogs.deviceId, deviceId), eq(biometricLogs.biometricId, bioId)));
          }
          continue;
        }
        newEmpId = rows[0].id;
      } catch (insertErr) {
        // Unique constraint violated — find the already-existing employee and link
        const [conflicting] = await db.select().from(employees).where(eq(employees.biometricId, bioId));
        if (conflicting) {
          await db.update(biometricLogs).set({ employeeId: conflicting.id })
            .where(and(eq(biometricLogs.deviceId, deviceId), eq(biometricLogs.biometricId, bioId)));
        }
        continue;
      }

      await db.update(biometricLogs).set({ employeeId: newEmpId })
        .where(and(eq(biometricLogs.deviceId, deviceId), eq(biometricLogs.biometricId, bioId)));
      created++;
      console.log(`[BioSync] Auto-created employee ${empId} for biometricId=${bioId}`);
    } catch (err) {
      console.error(`[BioSync] Failed for biometricId=${bioId}:`, err);
    }
  }
  return created;
}

export async function processAttendance(deviceId: number): Promise<{ created: number; updated: number }> {
  const [dev] = await db.select().from(biometricDevices).where(eq(biometricDevices.id, deviceId));
  if (!dev?.branchId) return { created: 0, updated: 0 };

  const logs = await db.select({
    id: biometricLogs.id,
    employeeId: biometricLogs.employeeId,
    punchTime: biometricLogs.punchTime,
    punchType: biometricLogs.punchType,
  }).from(biometricLogs)
    .where(and(eq(biometricLogs.deviceId, deviceId), isNotNull(biometricLogs.employeeId)));

  const byEmpDate = new Map<string, typeof logs>();
  for (const log of logs) {
    const dateStr = log.punchTime.toISOString().split("T")[0];
    const key = `${log.employeeId}_${dateStr}`;
    if (!byEmpDate.has(key)) byEmpDate.set(key, []);
    byEmpDate.get(key)!.push(log);
  }

  let created = 0, updated = 0;

  for (const [key, group] of byEmpDate.entries()) {
    const [empIdStr, dateStr] = key.split("_");
    const empId = Number(empIdStr);
    const sorted = [...group].sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime());

    const firstPunch = sorted[0].punchTime.toISOString();
    const lastPunch  = sorted.length > 1 ? sorted[sorted.length - 1].punchTime.toISOString() : null;

    const [emp] = await db.select({ branchId: employees.branchId }).from(employees).where(eq(employees.id, empId));
    const branchId = emp?.branchId ?? dev.branchId;

    const [existing] = await db.select().from(attendanceRecords)
      .where(and(eq(attendanceRecords.employeeId, empId), eq(attendanceRecords.date, dateStr)));

    if (!existing) {
      const wh1 = lastPunch ? calcHours(firstPunch, lastPunch) : null;
      try {
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
        created++;
      } catch (insertErr: any) {
        // Unique constraint — record was created by concurrent call, just update it
        const [dup] = await db.select().from(attendanceRecords)
          .where(and(eq(attendanceRecords.employeeId, empId), eq(attendanceRecords.date, dateStr)));
        if (dup) {
          const outTime = lastPunch && (!dup.outTime1 || new Date(lastPunch) > new Date(dup.outTime1)) ? lastPunch : dup.outTime1;
          const wh = calcHours(dup.inTime1 ?? firstPunch, outTime ?? null);
          await db.update(attendanceRecords).set({ outTime1: outTime, workHours1: wh, totalHours: wh, updatedAt: new Date() }).where(eq(attendanceRecords.id, dup.id));
          updated++;
        }
      }
    } else {
      const updates: Record<string, any> = { source: "biometric", status: "present", updatedAt: new Date() };
      if (!existing.inTime1) updates.inTime1 = firstPunch;
      const currentOut = existing.outTime1 ? new Date(existing.outTime1) : null;
      const newOut = lastPunch ? new Date(lastPunch) : null;
      if (newOut && (!currentOut || newOut > currentOut)) updates.outTime1 = lastPunch;
      const wh1 = calcHours(updates.inTime1 ?? existing.inTime1, updates.outTime1 ?? existing.outTime1);
      if (wh1 !== null) { updates.workHours1 = wh1; updates.totalHours = wh1; }
      await db.update(attendanceRecords).set(updates).where(eq(attendanceRecords.id, existing.id));
      updated++;
    }

    await db.update(biometricLogs).set({ processed: true })
      .where(inArray(biometricLogs.id, group.map(l => l.id)));
  }

  if (created || updated) {
    console.log(`[BioSync] Device ${deviceId}: attendance created=${created} updated=${updated}`);
  }
  return { created, updated };
}

export async function autoSync(deviceId: number, branchId: number): Promise<void> {
  try {
    const empCreated = await autoCreateEmployees(deviceId, branchId);
    const { created, updated } = await processAttendance(deviceId);
    if (empCreated || created || updated) {
      console.log(`[BioSync] Auto-sync device ${deviceId}: employees=${empCreated} att_new=${created} att_updated=${updated}`);
    }
  } catch (err) {
    console.error(`[BioSync] Auto-sync error for device ${deviceId}:`, err);
  }
}

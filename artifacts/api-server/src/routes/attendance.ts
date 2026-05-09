import { Router } from "express";
import { db } from "@workspace/db";
import { attendanceRecords, employees, branches, shifts } from "@workspace/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { calcWorkHours, getDaysInMonth, today } from "../lib/helpers.js";
import { getRequestUser } from "../lib/request-user.js";

const router = Router();

async function enrichRecord(r: typeof attendanceRecords.$inferSelect) {
  const [emp] = await db.select({ name: employees.fullName, code: employees.employeeId })
    .from(employees).where(eq(employees.id, r.employeeId));
  const [br] = await db.select({ name: branches.name }).from(branches).where(eq(branches.id, r.branchId));
  const [sh] = r.employeeId ? await db.select({ name: shifts.name }).from(shifts)
    .leftJoin(employees, eq(employees.shiftId, shifts.id))
    .where(eq(employees.id, r.employeeId)) : [null];
  return {
    ...r,
    employeeName: emp?.name || "Unknown",
    employeeCode: emp?.code || "",
    branchName: br?.name || "",
    shiftName: null,
    date: r.date,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/today", async (req, res) => {
  try {
    const reqUser = await getRequestUser(req);
    const todayStr = today();
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;

    let empQuery = db.select({
      emp: employees,
      branchName: branches.name,
    }).from(employees).leftJoin(branches, eq(employees.branchId, branches.id))
      .where(eq(employees.status, "active"));

    const allEmp = await empQuery;
    let filtered = branchId ? allEmp.filter(r => r.emp.branchId === branchId) : allEmp;
    if (reqUser && !reqUser.isSuper && reqUser.branchIds.length > 0) {
      const allowed = new Set(reqUser.branchIds);
      filtered = filtered.filter(r => r.emp.branchId != null && allowed.has(r.emp.branchId));
    }

    const records = await db.select().from(attendanceRecords)
      .where(eq(attendanceRecords.date, todayStr));
    const recordMap = new Map(records.map(r => [r.employeeId, r]));

    const mappedRecords = filtered.map(({ emp, branchName }) => {
      const rec = recordMap.get(emp.id);
      return rec ? {
        ...rec,
        employeeName: emp.fullName,
        employeeCode: emp.employeeId,
        branchName: branchName || "",
        shiftName: null,
        createdAt: rec.createdAt.toISOString(),
      } : {
        id: -emp.id,
        employeeId: emp.id,
        employeeName: emp.fullName,
        employeeCode: emp.employeeId,
        branchId: emp.branchId,
        branchName: branchName || "",
        date: todayStr,
        status: "absent",
        inTime1: null, outTime1: null, workHours1: null,
        inTime2: null, outTime2: null, workHours2: null,
        totalHours: null, overtimeHours: null,
        shiftName: null, source: "system", remarks: null,
        createdAt: new Date().toISOString(),
      };
    });

    const present = mappedRecords.filter(r => r.status === "present").length;
    const absent = mappedRecords.filter(r => r.status === "absent").length;
    const late = mappedRecords.filter(r => r.status === "late").length;
    const halfDay = mappedRecords.filter(r => r.status === "half_day").length;
    const onLeave = mappedRecords.filter(r => r.status === "leave").length;

    res.json({
      date: todayStr,
      totalEmployees: filtered.length,
      present, absent, late, halfDay, onLeave,
      notMarked: absent,
      records: mappedRecords,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.get("/monthly-sheet", async (req, res) => {
  try {
    const reqUser = await getRequestUser(req);
    const { month, year, branchId } = req.query;
    const m = Number(month);
    const y = Number(year);
    const daysInMonth = getDaysInMonth(m, y);
    const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
    const endDate = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    let empQuery = db.select({
      emp: employees,
      branchName: branches.name,
    }).from(employees).leftJoin(branches, eq(employees.branchId, branches.id))
      .where(eq(employees.status, "active"));

    const allEmp = await empQuery;
    let filtered = branchId ? allEmp.filter(r => r.emp.branchId === Number(branchId)) : allEmp;
    if (reqUser && !reqUser.isSuper && reqUser.branchIds.length > 0) {
      const allowed = new Set(reqUser.branchIds);
      filtered = filtered.filter(r => r.emp.branchId != null && allowed.has(r.emp.branchId));
    }

    const records = await db.select().from(attendanceRecords)
      .where(and(gte(attendanceRecords.date, startDate), lte(attendanceRecords.date, endDate)));

    const empRecords = new Map<number, Map<number, typeof records[0]>>();
    for (const r of records) {
      if (!empRecords.has(r.employeeId)) empRecords.set(r.employeeId, new Map());
      const day = parseInt(r.date.split("-")[2]);
      empRecords.get(r.employeeId)!.set(day, r);
    }

    const rows = filtered.map(({ emp, branchName }) => {
      const empRecs = empRecords.get(emp.id) || new Map();
      const dailyStatus = [];
      let presentDays = 0, absentDays = 0, lateDays = 0, halfDays = 0, leaveDays = 0, holidayDays = 0;
      let totalWorkHours = 0, overtimeHours = 0;

      for (let d = 1; d <= daysInMonth; d++) {
        const rec = empRecs.get(d);
        if (rec) {
          dailyStatus.push({ day: d, status: rec.status, inTime: rec.inTime1, outTime: rec.outTime1, hours: rec.totalHours });
          if (rec.status === "present") presentDays++;
          else if (rec.status === "absent") absentDays++;
          else if (rec.status === "late") { lateDays++; presentDays++; }
          else if (rec.status === "half_day") halfDays++;
          else if (rec.status === "leave") leaveDays++;
          else if (rec.status === "holiday") holidayDays++;
          totalWorkHours += rec.totalHours || 0;
          overtimeHours += rec.overtimeHours || 0;
        } else {
          dailyStatus.push({ day: d, status: "absent" });
          absentDays++;
        }
      }

      return {
        employeeId: emp.id,
        employeeName: emp.fullName,
        employeeCode: emp.employeeId,
        designation: emp.designation,
        dailyStatus,
        presentDays, absentDays, lateDays, halfDays, leaveDays, holidayDays,
        totalWorkHours: Math.round(totalWorkHours * 10) / 10,
        overtimeHours: Math.round(overtimeHours * 10) / 10,
      };
    });

    const branchName = branchId ? (filtered[0]?.branchName || "All Branches") : "All Branches";
    res.json({ month: m, year: y, daysInMonth, branchName, rows });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.post("/punch", async (req, res) => {
  try {
    const { employeeId, type, time, remarks } = req.body;
    const todayStr = today();
    const punchTime = time || new Date().toTimeString().slice(0, 5);

    const [existing] = await db.select().from(attendanceRecords)
      .where(and(eq(attendanceRecords.employeeId, employeeId), eq(attendanceRecords.date, todayStr)));

    const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId));
    if (!emp) { res.status(404).json({ message: "Employee not found", success: false }); return; }

    if (existing) {
      const updates: any = { updatedAt: new Date() };
      if (type === "in") {
        if (!existing.inTime1) updates.inTime1 = punchTime;
        else updates.inTime2 = punchTime;
        updates.status = "present";
      } else {
        if (!existing.outTime1) {
          updates.outTime1 = punchTime;
          updates.workHours1 = calcWorkHours(existing.inTime1, punchTime);
          updates.totalHours = updates.workHours1;
        } else {
          updates.outTime2 = punchTime;
          updates.workHours2 = calcWorkHours(existing.inTime2, punchTime);
          updates.totalHours = (existing.workHours1 || 0) + updates.workHours2;
        }
      }
      if (remarks) updates.remarks = remarks;
      const [updated] = await db.update(attendanceRecords).set(updates).where(eq(attendanceRecords.id, existing.id)).returning();
      res.json({ ...updated, employeeName: emp.fullName, employeeCode: emp.employeeId, branchName: "", shiftName: null, createdAt: updated.createdAt.toISOString() });
    } else {
      const newRec: any = {
        employeeId,
        branchId: emp.branchId,
        date: todayStr,
        status: "present",
        source: "manual",
        remarks: remarks || null,
      };
      if (type === "in") newRec.inTime1 = punchTime;
      else newRec.outTime1 = punchTime;
      const [created] = await db.insert(attendanceRecords).values(newRec).returning();
      res.json({ ...created, employeeName: emp.fullName, employeeCode: emp.employeeId, branchName: "", shiftName: null, createdAt: created.createdAt.toISOString() });
    }
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.get("/", async (req, res) => {
  try {
    const { branchId, employeeId, date, startDate, endDate, status, page = "1", limit = "50" } = req.query;
    const all = await db.select({
      rec: attendanceRecords,
      empName: employees.fullName,
      empCode: employees.employeeId,
      branchName: branches.name,
    }).from(attendanceRecords)
      .leftJoin(employees, eq(attendanceRecords.employeeId, employees.id))
      .leftJoin(branches, eq(attendanceRecords.branchId, branches.id));

    let filtered = all;
    if (branchId) filtered = filtered.filter(r => r.rec.branchId === Number(branchId));
    if (employeeId) filtered = filtered.filter(r => r.rec.employeeId === Number(employeeId));
    if (date) filtered = filtered.filter(r => r.rec.date === date);
    if (startDate) filtered = filtered.filter(r => r.rec.date >= (startDate as string));
    if (endDate) filtered = filtered.filter(r => r.rec.date <= (endDate as string));
    if (status) filtered = filtered.filter(r => r.rec.status === status);

    const total = filtered.length;
    const p = Number(page), l = Number(limit);
    const paginated = filtered.slice((p - 1) * l, p * l);

    res.json({
      records: paginated.map(r => ({
        ...r.rec,
        employeeName: r.empName || "Unknown",
        employeeCode: r.empCode || "",
        branchName: r.branchName || "",
        shiftName: null,
        createdAt: r.rec.createdAt.toISOString(),
      })),
      total, page: p, limit: l,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.post("/", async (req, res) => {
  try {
    const body = req.body;
    const [emp] = await db.select().from(employees).where(eq(employees.id, body.employeeId));
    if (!emp) { res.status(404).json({ message: "Employee not found" }); return; }

    const workHours1 = calcWorkHours(body.inTime1, body.outTime1);
    const workHours2 = calcWorkHours(body.inTime2, body.outTime2);
    const totalHours = workHours1 + workHours2;

    const [rec] = await db.insert(attendanceRecords).values({
      ...body,
      branchId: emp.branchId,
      workHours1: workHours1 || null,
      workHours2: workHours2 || null,
      totalHours: totalHours || null,
    }).returning();

    const [br] = await db.select().from(branches).where(eq(branches.id, emp.branchId));
    res.status(201).json({ ...rec, employeeName: emp.fullName, employeeCode: emp.employeeId, branchName: br?.name || "", shiftName: null, createdAt: rec.createdAt.toISOString() });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.put("/:id", async (req, res) => {
  try {
    const body = req.body;
    const workHours1 = calcWorkHours(body.inTime1, body.outTime1);
    const workHours2 = calcWorkHours(body.inTime2, body.outTime2);
    const totalHours = workHours1 + workHours2;
    const [rec] = await db.update(attendanceRecords).set({
      ...body,
      workHours1: workHours1 || null,
      workHours2: workHours2 || null,
      totalHours: totalHours || null,
      updatedAt: new Date(),
    }).where(eq(attendanceRecords.id, Number(req.params.id))).returning();
    const [emp] = await db.select().from(employees).where(eq(employees.id, rec.employeeId));
    const [br] = await db.select().from(branches).where(eq(branches.id, rec.branchId));
    res.json({ ...rec, employeeName: emp?.fullName || "", employeeCode: emp?.employeeId || "", branchName: br?.name || "", shiftName: null, createdAt: rec.createdAt.toISOString() });
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

export default router;

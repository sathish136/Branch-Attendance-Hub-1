import { Router } from "express";
import { db } from "@workspace/db";
import { attendanceRecords, employees, branches } from "@workspace/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { getDaysInMonth, today } from "../lib/helpers.js";
import { getRequestUser } from "../lib/request-user.js";

const router = Router();

router.get("/attendance", async (req, res) => {
  try {
    const reqUser = await getRequestUser(req);
    const { startDate, endDate, branchId, employeeId, status } = req.query;
    const all = await db.select({
      rec: attendanceRecords,
      empName: employees.fullName,
      empCode: employees.employeeId,
      branchName: branches.name,
    }).from(attendanceRecords)
      .leftJoin(employees, eq(attendanceRecords.employeeId, employees.id))
      .leftJoin(branches, eq(attendanceRecords.branchId, branches.id));

    let filtered = all;
    if (reqUser && !reqUser.isSuper && reqUser.branchIds.length > 0) {
      const allowed = new Set(reqUser.branchIds);
      filtered = filtered.filter(r => r.rec.branchId != null && allowed.has(r.rec.branchId));
    }
    if (startDate) filtered = filtered.filter(r => r.rec.date >= (startDate as string));
    if (endDate) filtered = filtered.filter(r => r.rec.date <= (endDate as string));
    if (branchId) filtered = filtered.filter(r => r.rec.branchId === Number(branchId));
    if (employeeId) filtered = filtered.filter(r => r.rec.employeeId === Number(employeeId));
    if (status) filtered = filtered.filter(r => r.rec.status === status);

    const summary = { present: 0, absent: 0, late: 0, halfDay: 0, leave: 0, holiday: 0 };
    for (const r of filtered) {
      if (r.rec.status === "present") summary.present++;
      else if (r.rec.status === "absent") summary.absent++;
      else if (r.rec.status === "late") summary.late++;
      else if (r.rec.status === "half_day") summary.halfDay++;
      else if (r.rec.status === "leave") summary.leave++;
      else if (r.rec.status === "holiday") summary.holiday++;
    }

    res.json({
      startDate: startDate as string,
      endDate: endDate as string,
      totalRecords: filtered.length,
      summary,
      records: filtered.map(r => ({
        ...r.rec,
        employeeName: r.empName || "",
        employeeCode: r.empCode || "",
        branchName: r.branchName || "",
        shiftName: null,
        createdAt: r.rec.createdAt.toISOString(),
      })),
    });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.get("/monthly", async (req, res) => {
  try {
    const reqUser = await getRequestUser(req);
    const { month, year, branchId } = req.query;
    const m = Number(month);
    const y = Number(year);
    const daysInMonth = getDaysInMonth(m, y);
    const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
    const endDate = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    const allEmp = await db.select({
      emp: employees,
      branchName: branches.name,
    }).from(employees).leftJoin(branches, eq(employees.branchId, branches.id))
      .where(eq(employees.status, "active"));

    let filtered = branchId ? allEmp.filter(r => r.emp.branchId === Number(branchId)) : allEmp;
    if (reqUser && !reqUser.isSuper && reqUser.branchIds.length > 0) {
      const allowed = new Set(reqUser.branchIds);
      filtered = filtered.filter(r => r.emp.branchId != null && allowed.has(r.emp.branchId));
    }
    const records = await db.select().from(attendanceRecords)
      .where(and(gte(attendanceRecords.date, startDate), lte(attendanceRecords.date, endDate)));

    const empRecords = new Map<number, (typeof records[0])[]>();
    for (const r of records) {
      if (!empRecords.has(r.employeeId)) empRecords.set(r.employeeId, []);
      empRecords.get(r.employeeId)!.push(r);
    }

    const workingDays = daysInMonth;
    const empSummaries = filtered.map(({ emp, branchName }) => {
      const recs = empRecords.get(emp.id) || [];
      let presentDays = 0, absentDays = 0, lateDays = 0, halfDays = 0, leaveDays = 0, holidayDays = 0;
      let totalWorkHours = 0, overtimeHours = 0;
      for (const r of recs) {
        if (r.status === "present") presentDays++;
        else if (r.status === "absent") absentDays++;
        else if (r.status === "late") { lateDays++; presentDays++; }
        else if (r.status === "half_day") halfDays++;
        else if (r.status === "leave") leaveDays++;
        else if (r.status === "holiday") holidayDays++;
        totalWorkHours += r.totalHours || 0;
        overtimeHours += r.overtimeHours || 0;
      }
      const effectiveDays = workingDays - holidayDays;
      const attendancePercentage = effectiveDays > 0 ? Math.round(((presentDays + halfDays * 0.5) / effectiveDays) * 100) : 0;
      return {
        employeeId: emp.id, employeeName: emp.fullName, employeeCode: emp.employeeId,
        branchName: branchName || "", designation: emp.designation,
        presentDays, absentDays, lateDays, halfDays, leaveDays, holidayDays,
        totalWorkHours: Math.round(totalWorkHours * 10) / 10,
        overtimeHours: Math.round(overtimeHours * 10) / 10,
        attendancePercentage,
      };
    });

    res.json({ month: m, year: y, totalEmployees: filtered.length, workingDays, employees: empSummaries });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.get("/overtime", async (req, res) => {
  try {
    const reqUser = await getRequestUser(req);
    const { startDate, endDate, branchId } = req.query;
    const all = await db.select({
      rec: attendanceRecords,
      emp: employees,
      branchName: branches.name,
    }).from(attendanceRecords)
      .leftJoin(employees, eq(attendanceRecords.employeeId, employees.id))
      .leftJoin(branches, eq(attendanceRecords.branchId, branches.id));

    let filtered = all.filter(r => (r.rec.overtimeHours || 0) > 0);
    if (reqUser && !reqUser.isSuper && reqUser.branchIds.length > 0) {
      const allowed = new Set(reqUser.branchIds);
      filtered = filtered.filter(r => r.rec.branchId != null && allowed.has(r.rec.branchId));
    }
    if (startDate) filtered = filtered.filter(r => r.rec.date >= (startDate as string));
    if (endDate) filtered = filtered.filter(r => r.rec.date <= (endDate as string));
    if (branchId) filtered = filtered.filter(r => r.rec.branchId === Number(branchId));

    const empMap = new Map<number, any>();
    for (const r of filtered) {
      if (!empMap.has(r.rec.employeeId)) {
        empMap.set(r.rec.employeeId, {
          employeeId: r.rec.employeeId,
          employeeName: r.emp?.fullName || "",
          employeeCode: r.emp?.employeeId || "",
          branchName: r.branchName || "",
          designation: r.emp?.designation || "",
          totalOvertimeHours: 0,
          overtimeDays: 0,
          records: [],
        });
      }
      const entry = empMap.get(r.rec.employeeId);
      entry.totalOvertimeHours += r.rec.overtimeHours || 0;
      entry.overtimeDays++;
      entry.records.push({ date: r.rec.date, overtimeHours: r.rec.overtimeHours || 0 });
    }

    const totalOT = Array.from(empMap.values()).reduce((sum, e) => sum + e.totalOvertimeHours, 0);
    res.json({
      startDate: startDate as string,
      endDate: endDate as string,
      totalOvertimeHours: Math.round(totalOT * 10) / 10,
      employees: Array.from(empMap.values()).map(e => ({ ...e, totalOvertimeHours: Math.round(e.totalOvertimeHours * 10) / 10 })),
    });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.get("/summary", async (req, res) => {
  try {
    const reqUser = await getRequestUser(req);
    const { branchId } = req.query;
    const todayStr = today();
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = now.getFullYear();
    const daysInMonth = getDaysInMonth(m, y);
    const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
    const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    const allEmp = await db.select({ emp: employees, branchName: branches.name })
      .from(employees).leftJoin(branches, eq(employees.branchId, branches.id))
      .where(eq(employees.status, "active"));
    let filteredEmp = branchId ? allEmp.filter(r => r.emp.branchId === Number(branchId)) : allEmp;
    if (reqUser && !reqUser.isSuper && reqUser.branchIds.length > 0) {
      const allowed = new Set(reqUser.branchIds);
      filteredEmp = filteredEmp.filter(r => r.emp.branchId != null && allowed.has(r.emp.branchId));
    }
    const empIds = filteredEmp.map(r => r.emp.id);

    const allBranches = await db.select().from(branches).where(eq(branches.isActive, true));

    const todayRecs = await db.select().from(attendanceRecords).where(eq(attendanceRecords.date, todayStr));
    const filteredToday = branchId ? todayRecs.filter(r => r.branchId === Number(branchId)) : todayRecs;
    const present = filteredToday.filter(r => r.status === "present" || r.status === "late").length;
    const absent = filteredToday.filter(r => r.status === "absent").length;
    const late = filteredToday.filter(r => r.status === "late").length;
    const onLeave = filteredToday.filter(r => r.status === "leave").length;
    const total = filteredEmp.length;
    const attPct = total > 0 ? Math.round((present / total) * 100) : 0;

    const monthRecs = await db.select().from(attendanceRecords)
      .where(and(gte(attendanceRecords.date, monthStart), lte(attendanceRecords.date, monthEnd)));
    const filteredMonth = branchId ? monthRecs.filter(r => r.branchId === Number(branchId)) : monthRecs;
    const monthPresent = filteredMonth.filter(r => r.status === "present" || r.status === "late").length;
    const monthTotal = filteredEmp.length * daysInMonth;
    const monthPct = monthTotal > 0 ? Math.round((monthPresent / monthTotal) * 100) : 0;
    const totalOT = filteredMonth.reduce((s, r) => s + (r.overtimeHours || 0), 0);

    const branchWise = allBranches.slice(0, 10).map(b => {
      const empInBranch = allEmp.filter(r => r.emp.branchId === b.id).length;
      const presentInBranch = filteredToday.filter(r => r.branchId === b.id && (r.status === "present" || r.status === "late")).length;
      return { branchId: b.id, branchName: b.name, present: presentInBranch, absent: empInBranch - presentInBranch, total: empInBranch };
    });

    const recentRecs = await db.select({
      rec: attendanceRecords,
      empName: employees.fullName,
      empCode: employees.employeeId,
      branchName: branches.name,
    }).from(attendanceRecords)
      .leftJoin(employees, eq(attendanceRecords.employeeId, employees.id))
      .leftJoin(branches, eq(attendanceRecords.branchId, branches.id));
    const recent = recentRecs.slice(-10).reverse().map(r => ({
      ...r.rec,
      employeeName: r.empName || "",
      employeeCode: r.empCode || "",
      branchName: r.branchName || "",
      shiftName: null,
      createdAt: r.rec.createdAt.toISOString(),
    }));

    res.json({
      totalEmployees: total,
      totalBranches: allBranches.length,
      presentToday: present,
      absentToday: absent,
      lateToday: late,
      onLeaveToday: onLeave,
      attendancePercentageToday: attPct,
      monthlyAttendancePercentage: monthPct,
      totalOvertimeThisMonth: Math.round(totalOT * 10) / 10,
      recentAttendance: recent,
      branchWiseSummary: branchWise,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

export default router;

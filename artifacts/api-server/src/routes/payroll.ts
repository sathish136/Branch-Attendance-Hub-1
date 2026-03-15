import { Router } from "express";
import { db } from "@workspace/db";
import { payrollRecords, employees, attendanceRecords, branches } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";

const router = Router();

const SALARY_SCALE: Record<string, number> = {
  "Postmaster General": 150000,
  "Deputy Postmaster General": 120000,
  "Regional Postmaster": 80000,
  "Sub Postmaster": 60000,
  "Postal Supervisor": 55000,
  "Senior Postal Officer": 50000,
  "Postal Officer": 45000,
  "Counter Clerk": 40000,
  "Sorting Officer": 38000,
  "Delivery Agent": 35000,
  "Accounts Officer": 55000,
  "HR Officer": 50000,
  "IT Officer": 55000,
  "PSB Officer": 48000,
  "Driver": 38000,
  "Security Officer": 35000,
  "Clerical Assistant": 32000,
  "Data Entry Operator": 35000,
};

function calcAPIT(grossMonthly: number): number {
  const annual = grossMonthly * 12;
  if (annual <= 1800000) return 0;
  if (annual <= 3000000) return Math.round(((annual - 1800000) * 0.06) / 12);
  if (annual <= 4200000) return Math.round(((1200000 * 0.06 + (annual - 3000000) * 0.12) / 12));
  if (annual <= 5400000) return Math.round(((1200000 * 0.06 + 1200000 * 0.12 + (annual - 4200000) * 0.18) / 12));
  if (annual <= 6600000) return Math.round(((1200000 * 0.06 + 1200000 * 0.12 + 1200000 * 0.18 + (annual - 5400000) * 0.24) / 12));
  return Math.round(((1200000 * 0.06 + 1200000 * 0.12 + 1200000 * 0.18 + 1200000 * 0.24 + (annual - 6600000) * 0.30) / 12));
}

function workingDaysInMonth(year: number, month: number): number {
  const days = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0) count++;
  }
  return count;
}

router.get("/", async (req, res) => {
  try {
    const { month, year, branchId, status } = req.query as Record<string, string>;
    if (!month || !year) return res.status(400).json({ message: "month and year required" });

    const conditions = [
      eq(payrollRecords.month, parseInt(month)),
      eq(payrollRecords.year, parseInt(year)),
    ];
    if (status) conditions.push(eq(payrollRecords.status, status as any));

    const rows = await db.select({
      payroll: payrollRecords,
      emp: {
        id: employees.id,
        employeeId: employees.employeeId,
        fullName: employees.fullName,
        designation: employees.designation,
        department: employees.department,
        branchId: employees.branchId,
      },
    }).from(payrollRecords)
      .innerJoin(employees, eq(payrollRecords.employeeId, employees.id));

    let result = rows.filter(r =>
      r.payroll.month === parseInt(month) && r.payroll.year === parseInt(year)
    );
    if (branchId) result = result.filter(r => r.payroll.branchId === parseInt(branchId));
    if (status) result = result.filter(r => r.payroll.status === status);

    res.json(result.map(r => ({ ...r.payroll, employee: r.emp })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to fetch payroll" });
  }
});

router.post("/generate", async (req, res) => {
  try {
    const { month, year, branchId } = req.body as { month: number; year: number; branchId?: number };
    if (!month || !year) return res.status(400).json({ message: "month and year required" });

    const allEmployees = await db.select().from(employees);
    const targetEmps = branchId ? allEmployees.filter(e => e.branchId === branchId) : allEmployees;

    if (targetEmps.length === 0) return res.status(404).json({ message: "No employees found" });

    const empIds = targetEmps.map(e => e.id);
    const datePrefix = `${year}-${String(month).padStart(2, "0")}`;
    const allAtt = await db.select().from(attendanceRecords)
      .where(inArray(attendanceRecords.employeeId, empIds));
    const filteredAtt = allAtt.filter(a => a.date.startsWith(datePrefix));

    const wdCount = workingDaysInMonth(year, month);
    const generated: any[] = [];

    const delConditions: any[] = [eq(payrollRecords.month, month), eq(payrollRecords.year, year)];
    if (branchId) delConditions.push(eq(payrollRecords.branchId, branchId));
    await db.delete(payrollRecords).where(and(...delConditions));


    for (const emp of targetEmps) {
      const empAtt = filteredAtt.filter(a => a.employeeId === emp.id);
      const presentDays = empAtt.filter(a => a.status === "present").length;
      const lateDays = empAtt.filter(a => a.status === "late").length;
      const absentDays = empAtt.filter(a => a.status === "absent").length;
      const leaveDays = empAtt.filter(a => a.status === "leave").length;
      const halfDays = empAtt.filter(a => a.status === "half_day").length;
      const holidayDays = empAtt.filter(a => a.status === "holiday").length;
      const totalOTHours = empAtt.reduce((s, a) => s + (a.overtimeHours || 0), 0);

      const basicSalary = SALARY_SCALE[emp.designation] ?? 40000;
      const transportAllowance = 5000;
      const housingAllowance = basicSalary >= 80000 ? 10000 : basicSalary >= 50000 ? 7000 : 3000;
      const otherAllowances = 1500;

      const dailyRate = basicSalary / wdCount;
      const hourlyRate = basicSalary / (wdCount * 8);
      const absenceDeduction = Math.round(dailyRate * absentDays);
      const lateDeduction = Math.round(lateDays * 100);
      const halfDayDeduction = Math.round(halfDays * (dailyRate / 2));
      const overtimePay = Math.round(totalOTHours * hourlyRate * 1.5);

      const grossSalary = Math.round(
        basicSalary + transportAllowance + housingAllowance + otherAllowances + overtimePay
        - absenceDeduction - lateDeduction - halfDayDeduction
      );

      const epfEmployee = Math.round(grossSalary * 0.08);
      const epfEmployer = Math.round(grossSalary * 0.12);
      const etfEmployer = Math.round(grossSalary * 0.03);
      const apit = calcAPIT(grossSalary);
      const totalDeductions = epfEmployee + apit + lateDeduction + absenceDeduction + halfDayDeduction;
      const netSalary = grossSalary - epfEmployee - apit;

      const record = {
        employeeId: emp.id,
        branchId: emp.branchId!,
        month,
        year,
        workingDays: wdCount,
        presentDays,
        absentDays,
        lateDays,
        leaveDays,
        holidayDays,
        overtimeHours: Math.round(totalOTHours * 100) / 100,
        basicSalary,
        transportAllowance,
        housingAllowance,
        otherAllowances,
        overtimePay,
        grossSalary,
        epfEmployee,
        epfEmployer,
        etfEmployer,
        apit,
        lateDeduction,
        absenceDeduction,
        otherDeductions: 0,
        totalDeductions,
        netSalary,
        status: "draft" as const,
        generatedAt: new Date(),
      };
      generated.push(record);
    }

    for (let i = 0; i < generated.length; i += 50) {
      await db.insert(payrollRecords).values(generated.slice(i, i + 50));
    }

    res.json({ success: true, count: generated.length, message: `Payroll generated for ${generated.length} employees` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to generate payroll" });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const { month, year } = req.query as Record<string, string>;
    if (!month || !year) return res.status(400).json({ message: "month and year required" });

    const rows = await db.select().from(payrollRecords)
      .where(and(eq(payrollRecords.month, parseInt(month)), eq(payrollRecords.year, parseInt(year))));

    const summary = {
      totalEmployees: rows.length,
      totalGross: rows.reduce((s, r) => s + r.grossSalary, 0),
      totalNet: rows.reduce((s, r) => s + r.netSalary, 0),
      totalEPF: rows.reduce((s, r) => s + r.epfEmployee + r.epfEmployer, 0),
      totalETF: rows.reduce((s, r) => s + r.etfEmployer, 0),
      totalAPIT: rows.reduce((s, r) => s + r.apit, 0),
      totalOTPay: rows.reduce((s, r) => s + r.overtimePay, 0),
      statusCounts: {
        draft: rows.filter(r => r.status === "draft").length,
        approved: rows.filter(r => r.status === "approved").length,
        paid: rows.filter(r => r.status === "paid").length,
      }
    };
    res.json(summary);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to fetch summary" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db.select({
      payroll: payrollRecords,
      emp: employees,
    }).from(payrollRecords)
      .innerJoin(employees, eq(payrollRecords.employeeId, employees.id))
      .where(eq(payrollRecords.id, id));

    if (!rows.length) return res.status(404).json({ message: "Not found" });
    const r = rows[0];
    res.json({ ...r.payroll, employee: r.emp });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to fetch payslip" });
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body as { status: "draft" | "approved" | "paid" };
    const update: any = { status, updatedAt: new Date() };
    if (status === "approved") update.approvedAt = new Date();
    if (status === "paid") update.paidAt = new Date();
    await db.update(payrollRecords).set(update).where(eq(payrollRecords.id, id));
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to update status" });
  }
});

router.patch("/bulk-status", async (req, res) => {
  try {
    const { ids, status } = req.body as { ids: number[]; status: "draft" | "approved" | "paid" };
    const update: any = { status, updatedAt: new Date() };
    if (status === "approved") update.approvedAt = new Date();
    if (status === "paid") update.paidAt = new Date();
    await db.update(payrollRecords).set(update).where(inArray(payrollRecords.id, ids));
    res.json({ success: true, updated: ids.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to bulk update" });
  }
});

export default router;

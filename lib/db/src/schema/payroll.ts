import { pgTable, serial, integer, real, text, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employees } from "./employees";
import { branches } from "./branches";

export const payrollRecords = pgTable("payroll_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  branchId: integer("branch_id").notNull().references(() => branches.id),
  month: integer("month").notNull(),
  year: integer("year").notNull(),

  workingDays: integer("working_days").notNull().default(0),
  presentDays: integer("present_days").notNull().default(0),
  absentDays: integer("absent_days").notNull().default(0),
  lateDays: integer("late_days").notNull().default(0),
  leaveDays: integer("leave_days").notNull().default(0),
  holidayDays: integer("holiday_days").notNull().default(0),
  overtimeHours: real("overtime_hours").notNull().default(0),

  basicSalary: real("basic_salary").notNull().default(0),
  transportAllowance: real("transport_allowance").notNull().default(0),
  housingAllowance: real("housing_allowance").notNull().default(0),
  otherAllowances: real("other_allowances").notNull().default(0),
  overtimePay: real("overtime_pay").notNull().default(0),
  grossSalary: real("gross_salary").notNull().default(0),

  epfEmployee: real("epf_employee").notNull().default(0),
  epfEmployer: real("epf_employer").notNull().default(0),
  etfEmployer: real("etf_employer").notNull().default(0),
  apit: real("apit").notNull().default(0),
  lateDeduction: real("late_deduction").notNull().default(0),
  absenceDeduction: real("absence_deduction").notNull().default(0),
  otherDeductions: real("other_deductions").notNull().default(0),
  totalDeductions: real("total_deductions").notNull().default(0),

  netSalary: real("net_salary").notNull().default(0),

  status: text("status").notNull().$type<"draft" | "approved" | "paid">().default("draft"),
  remarks: text("remarks"),

  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPayrollSchema = createInsertSchema(payrollRecords).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayroll = z.infer<typeof insertPayrollSchema>;
export type PayrollRecord = typeof payrollRecords.$inferSelect;

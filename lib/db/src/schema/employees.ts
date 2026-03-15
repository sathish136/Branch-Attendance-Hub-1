import { pgTable, serial, text, integer, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { branches } from "./branches";
import { shifts } from "./shifts";

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const designations = pgTable("designations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  departmentId: integer("department_id").references(() => departments.id),
  level: integer("level").default(1),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  fullName: text("full_name").notNull(),
  designation: text("designation").notNull(),
  department: text("department").notNull(),
  branchId: integer("branch_id").notNull().references(() => branches.id),
  shiftId: integer("shift_id").references(() => shifts.id),
  joiningDate: date("joining_date").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  biometricId: text("biometric_id"),
  status: text("status").notNull().$type<"active" | "on_leave" | "resigned" | "terminated">().default("active"),
  gender: text("gender").$type<"male" | "female" | "other">().default("male"),
  dateOfBirth: date("date_of_birth"),
  address: text("address"),
  employeeType: text("employee_type").$type<"permanent" | "contract" | "casual">().default("permanent"),
  reportingManagerId: integer("reporting_manager_id"),
  nicNumber: text("nic_number"),
  epfNumber: text("epf_number"),
  etfNumber: text("etf_number"),
  aadharNumber: text("aadhar_number"),
  panNumber: text("pan_number"),
  aadharDocUrl: text("aadhar_doc_url"),
  panDocUrl: text("pan_doc_url"),
  certificatesDocUrl: text("certificates_doc_url"),
  resumeDocUrl: text("resume_doc_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true, createdAt: true });
export const insertDepartmentSchema = createInsertSchema(departments).omit({ id: true, createdAt: true });
export const insertDesignationSchema = createInsertSchema(designations).omit({ id: true, createdAt: true });

export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type Designation = typeof designations.$inferSelect;

import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { branches } from "./branches";
import { employees } from "./employees";

export const biometricDevices = pgTable("biometric_devices", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  serialNumber: text("serial_number").notNull().unique(),
  model: text("model").notNull().default("ZKTeco"),
  ipAddress: text("ip_address").notNull().default(""),
  port: integer("port").notNull().default(4370),
  branchId: integer("branch_id").references(() => branches.id),
  pushMethod: text("push_method").notNull().$type<"zkpush" | "sdk">().default("zkpush"),
  apiKey: text("api_key"),
  status: text("status").notNull().$type<"online" | "offline" | "error">().default("offline"),
  lastSync: timestamp("last_sync"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const biometricLogs = pgTable("biometric_logs", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => biometricDevices.id),
  employeeId: integer("employee_id").references(() => employees.id),
  biometricId: text("biometric_id").notNull(),
  punchTime: timestamp("punch_time").notNull(),
  punchType: text("punch_type").notNull().$type<"in" | "out" | "unknown">().default("unknown"),
  processed: boolean("processed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBiometricDeviceSchema = createInsertSchema(biometricDevices).omit({ id: true, createdAt: true });
export const insertBiometricLogSchema = createInsertSchema(biometricLogs).omit({ id: true, createdAt: true });
export type InsertBiometricDevice = z.infer<typeof insertBiometricDeviceSchema>;
export type BiometricDevice = typeof biometricDevices.$inferSelect;
export type BiometricLog = typeof biometricLogs.$inferSelect;

import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { systemUsers } from "./users";

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => systemUsers.id, { onDelete: "set null" }),
  username: text("username").notNull(),
  fullName: text("full_name").notNull().default(""),
  action: text("action").notNull(),
  module: text("module"),
  description: text("description"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  location: text("location"),
  sessionId: text("session_id"),
  status: text("status").notNull().default("success"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ActivityLog = typeof activityLogs.$inferSelect;

import {
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core Manus OAuth identity. Feature tables always use this numeric id as ownerId. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const visibilityEnum = mysqlEnum("visibility", ["private", "friends", "public"]);
export const entityStatusEnum = mysqlEnum("entity_status", ["active", "paused", "completed", "archived"]);
export const taskStatusEnum = mysqlEnum("task_status", ["todo", "doing", "done", "dropped"]);

export const userProfiles = mysqlTable("user_profiles", {
  userId: int("userId").primaryKey().notNull(),
  displayName: varchar("displayName", { length: 100 }),
  bio: text("bio"),
  avatarUrl: text("avatarUrl"),
  timezone: varchar("timezone", { length: 64 }).default("Asia/Shanghai").notNull(),
  defaultVisibility: visibilityEnum.default("private").notNull(),
  discoverable: boolean("discoverable").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const goals = mysqlTable("goals", {
  id: varchar("id", { length: 36 }).primaryKey(),
  ownerId: int("ownerId").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 16 }).default("#6EA8FE").notNull(),
  entityStatus: entityStatusEnum.default("active").notNull(),
  visibility: visibilityEnum.default("private").notNull(),
  lastActiveAt: timestamp("lastActiveAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("goals_owner_updated_idx").on(table.ownerId, table.updatedAt)]);

export const projects = mysqlTable("projects", {
  id: varchar("id", { length: 36 }).primaryKey(),
  ownerId: int("ownerId").notNull(),
  goalId: varchar("goalId", { length: 36 }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 16 }).default("#7FB5D6").notNull(),
  entityStatus: entityStatusEnum.default("active").notNull(),
  visibility: visibilityEnum.default("private").notNull(),
  lastActiveAt: timestamp("lastActiveAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("projects_owner_updated_idx").on(table.ownerId, table.updatedAt), index("projects_goal_idx").on(table.goalId)]);

export const tasks = mysqlTable("tasks", {
  id: varchar("id", { length: 36 }).primaryKey(),
  ownerId: int("ownerId").notNull(),
  projectId: varchar("projectId", { length: 36 }),
  title: varchar("title", { length: 240 }).notNull(),
  notes: text("notes"),
  status: taskStatusEnum.default("todo").notNull(),
  importance: mysqlEnum("task_importance", ["important", "not_important"]).default("important").notNull(),
  urgencyMode: mysqlEnum("task_urgency_mode", ["auto", "manual"]).default("auto").notNull(),
  manualUrgent: boolean("manualUrgent").default(false).notNull(),
  dueAt: timestamp("dueAt"),
  duePrecision: mysqlEnum("due_precision", ["unknown", "date", "datetime"]).default("unknown").notNull(),
  estimatedMinutes: int("estimatedMinutes"),
  doneAt: timestamp("doneAt"),
  droppedAt: timestamp("droppedAt"),
  firstBreachedAt: timestamp("firstBreachedAt"),
  visibility: visibilityEnum.default("private").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("tasks_owner_updated_idx").on(table.ownerId, table.updatedAt),
  index("tasks_owner_due_idx").on(table.ownerId, table.dueAt),
  index("tasks_project_idx").on(table.projectId),
]);

export const relationshipEdges = mysqlTable("relationship_edges", {
  id: varchar("id", { length: 36 }).primaryKey(),
  ownerId: int("ownerId").notNull(),
  fromType: mysqlEnum("edge_from_type", ["goal", "project", "task"]).notNull(),
  fromId: varchar("fromId", { length: 36 }).notNull(),
  toType: mysqlEnum("edge_to_type", ["goal", "project", "task"]).notNull(),
  toId: varchar("toId", { length: 36 }).notNull(),
  relation: varchar("relation", { length: 48 }).default("supports").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("edges_owner_idx").on(table.ownerId), uniqueIndex("edges_unique_link").on(table.ownerId, table.fromType, table.fromId, table.toType, table.toId, table.relation)]);

export const executionEvents = mysqlTable("execution_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  taskId: varchar("taskId", { length: 36 }).notNull(),
  ownerId: int("ownerId").notNull(),
  type: mysqlEnum("execution_event_type", ["breached", "completed_on_time", "completed_late", "dropped_after_breach"]).notNull(),
  occurredAt: timestamp("occurredAt").notNull(),
  dueAtSnapshot: timestamp("dueAtSnapshot"),
  idempotencyKey: varchar("idempotencyKey", { length: 150 }).notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("execution_events_task_idx").on(table.taskId, table.occurredAt), uniqueIndex("execution_events_idempotency_key").on(table.idempotencyKey)]);

/** At most one active timer per owner; stopping it materializes an immutable TimeEntry. */
export const activeTimers = mysqlTable("active_timers", {
  id: varchar("id", { length: 36 }).primaryKey(),
  ownerId: int("ownerId").notNull().unique(),
  taskId: varchar("taskId", { length: 36 }),
  projectId: varchar("projectId", { length: 36 }),
  startedAt: timestamp("startedAt").notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const timeEntries = mysqlTable("time_entries", {
  id: varchar("id", { length: 36 }).primaryKey(),
  ownerId: int("ownerId").notNull(),
  taskId: varchar("taskId", { length: 36 }),
  projectId: varchar("projectId", { length: 36 }),
  startedAt: timestamp("startedAt").notNull(),
  endedAt: timestamp("endedAt").notNull(),
  durationMinutes: int("durationMinutes").notNull(),
  note: text("note"),
  source: mysqlEnum("time_entry_source", ["timer", "manual"]).default("manual").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("time_entries_owner_started_idx").on(table.ownerId, table.startedAt), index("time_entries_project_idx").on(table.projectId)]);

export const weeklyReviews = mysqlTable("weekly_reviews", {
  id: varchar("id", { length: 36 }).primaryKey(),
  ownerId: int("ownerId").notNull(),
  weekStartAt: timestamp("weekStartAt").notNull(),
  reflection: text("reflection"),
  wins: json("wins"),
  blockers: json("blockers"),
  nextActions: json("nextActions"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("weekly_reviews_owner_week").on(table.ownerId, table.weekStartAt)]);

export const weeklyReports = mysqlTable("weekly_reports", {
  id: varchar("id", { length: 36 }).primaryKey(),
  ownerId: int("ownerId").notNull(),
  weekStartAt: timestamp("weekStartAt").notNull(),
  kind: mysqlEnum("weekly_report_kind", ["preview", "final"]).notNull(),
  snapshot: json("snapshot").notNull(),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("weekly_reports_owner_week_kind").on(table.ownerId, table.weekStartAt, table.kind)]);

export const friendships = mysqlTable("friendships", {
  id: varchar("id", { length: 36 }).primaryKey(),
  requesterId: int("requesterId").notNull(),
  recipientId: int("recipientId").notNull(),
  status: mysqlEnum("friendship_status", ["pending", "accepted", "blocked"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("friendships_pair_unique").on(table.requesterId, table.recipientId), index("friendships_recipient_idx").on(table.recipientId, table.status)]);

export const visibilityGrants = mysqlTable("visibility_grants", {
  id: varchar("id", { length: 36 }).primaryKey(),
  ownerId: int("ownerId").notNull(),
  viewerId: int("viewerId").notNull(),
  entityType: mysqlEnum("grant_entity_type", ["profile", "goal", "project", "task"]).notNull(),
  entityId: varchar("entityId", { length: 36 }),
  permission: mysqlEnum("grant_permission", ["summary", "details"]).default("summary").notNull(),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("visibility_grants_owner_viewer_idx").on(table.ownerId, table.viewerId), uniqueIndex("visibility_grant_unique").on(table.ownerId, table.viewerId, table.entityType, table.entityId)]);

export const scheduledJobs = mysqlTable("scheduled_jobs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  ownerId: int("ownerId").notNull(),
  kind: mysqlEnum("scheduled_job_kind", ["time_facts", "weekly_preview", "weekly_final"]).notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  timezone: varchar("timezone", { length: 64 }).default("Asia/Shanghai").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("scheduled_jobs_owner_kind").on(table.ownerId, table.kind), index("scheduled_jobs_task_uid_idx").on(table.scheduleCronTaskUid)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  activeTimers,
  executionEvents,
  goals,
  projects,
  relationshipEdges,
  tasks,
  timeEntries,
  userProfiles,
  weeklyReports,
  weeklyReviews,
} from "../drizzle/schema";
import { getDb } from "./db";

/**
 * 启动后首次访问数据库时执行的幂等 schema 修补。
 * Drizzle schema 与线上表结构可能存在漂移（手动迁移 db:push 不随部署执行），
 * 这里用 ALTER TABLE ... 容错补齐，保证 SELECT/UPDATE 不会因缺列而 500。
 */
let schemaPatch: Promise<void> | null = null;

async function patchSchema(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // projects.color：2026-09-01 新增（行星颜色自定义）
  // 注意：迁移 SQL 使用 entity_status 列名，此处也需对应
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN color VARCHAR(16) NOT NULL DEFAULT '#7FB5D6' AFTER entity_status`);
  } catch {
    /* 列已存在或其他环境差异，忽略 */
  }
  // goals.color 同样需要补建
  try {
    await db.execute(sql`ALTER TABLE goals ADD COLUMN color VARCHAR(16) NOT NULL DEFAULT '#6EA8FE' AFTER description`);
  } catch {
    /* 列已存在或其他环境差异，忽略 */
  }
}

export async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "云端数据服务暂不可用" });
  if (!schemaPatch) {
    schemaPatch = patchSchema().catch(() => {
      schemaPatch = null; // 失败可重试
    });
  }
  await schemaPatch;
  return db;
}

export async function ensureProfile(user: { id: number; name?: string | null }) {
  const db = await requireDb();
  await db.insert(userProfiles).values({ userId: user.id, displayName: user.name ?? null }).onDuplicateKeyUpdate({
    set: { updatedAt: new Date() },
  });
  return (await db.select().from(userProfiles).where(eq(userProfiles.userId, user.id)).limit(1))[0]!;
}

export async function materializeTimeFacts(ownerId: number, now = new Date()) {
  const db = await requireDb();
  const overdue = await db.select().from(tasks).where(and(
    eq(tasks.ownerId, ownerId),
    or(eq(tasks.status, "todo"), eq(tasks.status, "doing")),
    lt(tasks.dueAt, now),
    isNull(tasks.firstBreachedAt),
  ));
  for (const task of overdue) {
    if (!task.dueAt) continue;
    const key = `breach:${task.id}:${task.dueAt.getTime()}`;
    await db.insert(executionEvents).values({
      id: nanoid(), taskId: task.id, ownerId, type: "breached", occurredAt: now,
      dueAtSnapshot: task.dueAt, idempotencyKey: key, metadata: { source: "server-rule" },
    }).onDuplicateKeyUpdate({ set: { idempotencyKey: key } });
    await db.update(tasks).set({ firstBreachedAt: now }).where(and(eq(tasks.id, task.id), isNull(tasks.firstBreachedAt)));
  }
  return overdue.length;
}

export async function completeOrDropTask(input: { ownerId: number; taskId: string; status: "done" | "dropped"; now?: Date }) {
  const db = await requireDb();
  const now = input.now ?? new Date();
  const task = (await db.select().from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.ownerId, input.ownerId))).limit(1))[0];
  if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
  if (task.status === "done" || task.status === "dropped") return task;
  const late = Boolean(task.firstBreachedAt || (task.dueAt && task.dueAt.getTime() < now.getTime()));
  const type = input.status === "done" ? (late ? "completed_late" : "completed_on_time") : (late ? "dropped_after_breach" : null);
  await db.update(tasks).set({
    status: input.status,
    doneAt: input.status === "done" ? now : null,
    droppedAt: input.status === "dropped" ? now : null,
    firstBreachedAt: late && !task.firstBreachedAt ? now : task.firstBreachedAt,
  }).where(eq(tasks.id, task.id));
  if (type) {
    const dueKey = task.dueAt?.getTime() ?? "none";
    await db.insert(executionEvents).values({
      id: nanoid(), taskId: task.id, ownerId: input.ownerId, type, occurredAt: now,
      dueAtSnapshot: task.dueAt, idempotencyKey: `${type}:${task.id}:${dueKey}`, metadata: { source: "task-mutation" },
    }).onDuplicateKeyUpdate({ set: { idempotencyKey: `${type}:${task.id}:${dueKey}` } });
  }
  return (await db.select().from(tasks).where(eq(tasks.id, task.id)).limit(1))[0]!;
}

export async function getOwnerSnapshot(ownerId: number, changedSince?: Date) {
  const db = await requireDb();
  const goalFilter = changedSince ? and(eq(goals.ownerId, ownerId), gte(goals.updatedAt, changedSince)) : eq(goals.ownerId, ownerId);
  const projectFilter = changedSince ? and(eq(projects.ownerId, ownerId), gte(projects.updatedAt, changedSince)) : eq(projects.ownerId, ownerId);
  const taskFilter = changedSince ? and(eq(tasks.ownerId, ownerId), gte(tasks.updatedAt, changedSince)) : eq(tasks.ownerId, ownerId);
  const [goalRows, projectRows, taskRows, edgeRows, timeRows, reviewRows, reportRows, eventRows, activeTimerRows] = await Promise.all([
    db.select().from(goals).where(goalFilter).orderBy(asc(goals.createdAt)),
    db.select().from(projects).where(projectFilter).orderBy(asc(projects.createdAt)),
    db.select().from(tasks).where(taskFilter).orderBy(asc(tasks.createdAt)),
    db.select().from(relationshipEdges).where(eq(relationshipEdges.ownerId, ownerId)).orderBy(asc(relationshipEdges.createdAt)),
    db.select().from(timeEntries).where(eq(timeEntries.ownerId, ownerId)).orderBy(asc(timeEntries.startedAt)),
    db.select().from(weeklyReviews).where(eq(weeklyReviews.ownerId, ownerId)).orderBy(asc(weeklyReviews.weekStartAt)),
    db.select().from(weeklyReports).where(eq(weeklyReports.ownerId, ownerId)).orderBy(asc(weeklyReports.weekStartAt)),
    db.select().from(executionEvents).where(eq(executionEvents.ownerId, ownerId)).orderBy(asc(executionEvents.occurredAt)),
    db.select().from(activeTimers).where(eq(activeTimers.ownerId, ownerId)),
  ]);
  return { goals: goalRows, projects: projectRows, tasks: taskRows, edges: edgeRows, timeEntries: timeRows, weeklyReviews: reviewRows, weeklyReports: reportRows, executionEvents: eventRows, activeTimer: activeTimerRows[0] ?? null, pulledAt: new Date() };
}

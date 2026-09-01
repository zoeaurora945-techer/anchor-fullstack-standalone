import { and, eq, gte, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { activeTimers, executionEvents, tasks, timeEntries } from "../../drizzle/schema";
import { buildWeeklySnapshot, mondayUtc, materializeWeeklyReport } from "../weeklyService";
import { requireDb } from "../anchorDb";
import { protectedProcedure, router } from "../_core/trpc";

export const timeRouter = router({
  week: protectedProcedure.input(z.object({ weekStartAt: z.date().optional() })).query(async ({ ctx, input }) =>
    buildWeeklySnapshot(ctx.user.id, mondayUtc(input.weekStartAt))),
  entries: protectedProcedure.input(z.object({ weekStartAt: z.date().optional() })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const weekStartAt = mondayUtc(input.weekStartAt);
    const weekEndAt = new Date(weekStartAt.getTime() + 7 * 86400000);
    return db.select().from(timeEntries).where(and(eq(timeEntries.ownerId, ctx.user.id), gte(timeEntries.startedAt, weekStartAt), lt(timeEntries.startedAt, weekEndAt)));
  }),
  active: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return (await db.select().from(activeTimers).where(eq(activeTimers.ownerId, ctx.user.id)).limit(1))[0] ?? null;
  }),
  start: protectedProcedure.input(z.object({ taskId: z.string().nullable().optional(), projectId: z.string().nullable().optional(), note: z.string().max(1000).nullable().optional() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const existing = (await db.select().from(activeTimers).where(eq(activeTimers.ownerId, ctx.user.id)).limit(1))[0];
    if (existing) return existing;
    const timer = { id: nanoid(), ownerId: ctx.user.id, taskId: input.taskId ?? null, projectId: input.projectId ?? null, note: input.note ?? null, startedAt: new Date() };
    await db.insert(activeTimers).values(timer);
    return timer;
  }),
  stop: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const timer = (await db.select().from(activeTimers).where(eq(activeTimers.ownerId, ctx.user.id)).limit(1))[0];
    if (!timer) return null;
    const endedAt = new Date();
    const durationMinutes = Math.max(1, Math.round((endedAt.getTime() - timer.startedAt.getTime()) / 60000));
    const entry = { id: nanoid(), ownerId: ctx.user.id, taskId: timer.taskId, projectId: timer.projectId, startedAt: timer.startedAt, endedAt, durationMinutes, note: timer.note, source: "timer" as const };
    await db.insert(timeEntries).values(entry);
    await db.delete(activeTimers).where(eq(activeTimers.id, timer.id));
    return entry;
  }),
  addManual: protectedProcedure.input(z.object({ taskId: z.string().nullable().optional(), projectId: z.string().nullable().optional(), startedAt: z.date(), endedAt: z.date(), note: z.string().max(1000).nullable().optional() })).mutation(async ({ ctx, input }) => {
    if (input.endedAt.getTime() <= input.startedAt.getTime()) throw new Error("结束时间必须晚于开始时间");
    const db = await requireDb();
    const entry = { id: nanoid(), ownerId: ctx.user.id, taskId: input.taskId ?? null, projectId: input.projectId ?? null, startedAt: input.startedAt, endedAt: input.endedAt, durationMinutes: Math.max(1, Math.round((input.endedAt.getTime() - input.startedAt.getTime()) / 60000)), note: input.note ?? null, source: "manual" as const };
    await db.insert(timeEntries).values(entry);
    return entry;
  }),
  report: protectedProcedure.input(z.object({ kind: z.enum(["preview", "final"]) })).mutation(async ({ ctx, input }) => materializeWeeklyReport(ctx.user.id, input.kind)),
  archive: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(150).default(60) })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const events = await db.select().from(executionEvents).where(eq(executionEvents.ownerId, ctx.user.id)).orderBy(executionEvents.occurredAt).limit(input.limit);
    const ownedTasks = await db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(eq(tasks.ownerId, ctx.user.id));
    const names = new Map(ownedTasks.map((task) => [task.id, task.title]));
    return events.map((event) => ({ ...event, taskTitle: names.get(event.taskId) ?? "已删除任务" }));
  }),
});

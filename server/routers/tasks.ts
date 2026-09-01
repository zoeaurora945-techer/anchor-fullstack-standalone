import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { tasks } from "../../drizzle/schema";
import { requireDb } from "../anchorDb";
import { resolveQuadrant } from "@shared/taskRules";
import { protectedProcedure, router } from "../_core/trpc";

const QUADRANT_FLAGS: Record<
  string,
  { importance: "important" | "not_important"; manualUrgent: boolean }
> = {
  q1: { importance: "important", manualUrgent: true },
  q2: { importance: "important", manualUrgent: false },
  q3: { importance: "not_important", manualUrgent: true },
  q4: { importance: "not_important", manualUrgent: false },
};

export const taskRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const rows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.ownerId, ctx.user.id))
      .orderBy(desc(tasks.createdAt));
    const now = new Date();
    const timezone = "Asia/Shanghai";
    return rows.map((t) => ({
      ...t,
      quadrant: resolveQuadrant(
        {
          status: t.status,
          importance: t.importance,
          urgencyMode: t.urgencyMode,
          manualUrgent: t.manualUrgent,
          dueAt: t.dueAt,
          firstBreachedAt: t.firstBreachedAt,
        },
        now,
        timezone,
      ),
    }));
  }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(240),
        dueAt: z.date().nullable().optional(),
        duePrecision: z.enum(["unknown", "date", "datetime"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const id = nanoid();
      await db.insert(tasks).values({
        id,
        ownerId: ctx.user.id,
        title: input.title,
        status: "todo",
        importance: "important",
        urgencyMode: "auto",
        manualUrgent: false,
        dueAt: input.dueAt ?? null,
        duePrecision: input.duePrecision ?? "unknown",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { id };
    }),

  move: protectedProcedure
    .input(z.object({ id: z.string(), quadrant: z.enum(["q1", "q2", "q3", "q4"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const flags = QUADRANT_FLAGS[input.quadrant];
      await db
        .update(tasks)
        .set({
          importance: flags.importance,
          urgencyMode: "manual",
          manualUrgent: flags.manualUrgent,
          updatedAt: new Date(),
        })
        .where(and(eq(tasks.id, input.id), eq(tasks.ownerId, ctx.user.id)));
      return { success: true };
    }),

  finish: protectedProcedure
    .input(z.object({ id: z.string(), status: z.enum(["todo", "done", "dropped"]).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const status = input.status ?? "done";
      await db
        .update(tasks)
        .set({
          status,
          doneAt: status === "done" ? new Date() : null,
          droppedAt: status === "dropped" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(and(eq(tasks.id, input.id), eq(tasks.ownerId, ctx.user.id)));
      return { success: true };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(240).optional(),
        notes: z.string().max(4000).nullable().optional(),
        dueAt: z.date().nullable().optional(),
        duePrecision: z.enum(["unknown", "date", "datetime"]).optional(),
        importance: z.enum(["important", "not_important"]).optional(),
        urgencyMode: z.enum(["auto", "manual"]).optional(),
        manualUrgent: z.boolean().optional(),
        projectId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      // 只写入前端显式传来的字段，避免把未提供的字段覆盖成 null
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) patch.title = input.title;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.dueAt !== undefined) patch.dueAt = input.dueAt;
      if (input.duePrecision !== undefined) patch.duePrecision = input.duePrecision;
      if (input.importance !== undefined) patch.importance = input.importance;
      if (input.urgencyMode !== undefined) patch.urgencyMode = input.urgencyMode;
      if (input.manualUrgent !== undefined) patch.manualUrgent = input.manualUrgent;
      if (input.projectId !== undefined) patch.projectId = input.projectId;
      await db
        .update(tasks)
        .set(patch)
        .where(and(eq(tasks.id, input.id), eq(tasks.ownerId, ctx.user.id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db
        .delete(tasks)
        .where(and(eq(tasks.id, input.id), eq(tasks.ownerId, ctx.user.id)));
      return { success: true };
    }),

  restore: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db
        .update(tasks)
        .set({
          status: "todo" as const,
          doneAt: null,
          droppedAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(tasks.id, input.id), eq(tasks.ownerId, ctx.user.id)));
      return { success: true };
    }),
});

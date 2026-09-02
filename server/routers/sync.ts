import { z } from "zod";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { goals, projects, relationshipEdges, tasks, userProfiles } from "../../drizzle/schema";
import { ensureProfile, getOwnerSnapshot, requireDb } from "../anchorDb";
import { protectedProcedure, router } from "../_core/trpc";

export const syncRouter = router({
  profile: protectedProcedure.query(async ({ ctx }) => ensureProfile(ctx.user)),
  updateProfile: protectedProcedure.input(z.object({
    displayName: z.string().trim().max(100).nullable().optional(), bio: z.string().max(1000).nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(), timezone: z.string().min(1).max(64).optional(),
    defaultVisibility: z.enum(["private", "friends", "public"]).optional(), discoverable: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    await ensureProfile(ctx.user);
    const db = await requireDb();
    await db.update(userProfiles).set({ ...input, updatedAt: new Date() }).where(eq(userProfiles.userId, ctx.user.id));
    return (await db.select().from(userProfiles).where(eq(userProfiles.userId, ctx.user.id)).limit(1))[0]!;
  }),
  pull: protectedProcedure.input(z.object({ changedSince: z.coerce.date().optional() })).query(async ({ ctx, input }) => {
    await ensureProfile(ctx.user);
    return getOwnerSnapshot(ctx.user.id, input.changedSince);
  }),
  importLegacy: protectedProcedure.input(z.object({
    goals: z.array(z.object({ id: z.string().min(1), title: z.string().min(1), description: z.string().nullable().optional(), color: z.string().optional(), status: z.enum(["active", "paused", "completed", "archived"]).optional(), visibility: z.enum(["private", "friends", "public"]).optional() })).default([]),
    projects: z.array(z.object({ id: z.string().min(1), goalId: z.string().nullable().optional(), title: z.string().min(1), description: z.string().nullable().optional(), status: z.enum(["active", "paused", "completed", "archived"]).optional(), visibility: z.enum(["private", "friends", "public"]).optional() })).default([]),
    tasks: z.array(z.object({ id: z.string().min(1), projectId: z.string().nullable().optional(), title: z.string().min(1), notes: z.string().nullable().optional(), status: z.enum(["todo", "doing", "done", "dropped"]).optional(), dueAt: z.coerce.date().nullable().optional(), duePrecision: z.enum(["unknown", "date", "datetime"]).optional(), importance: z.enum(["important", "not_important"]).optional(), urgencyMode: z.enum(["auto", "manual"]).optional(), manualUrgent: z.boolean().optional() })).default([]),
    edges: z.array(z.object({ fromType: z.enum(["goal", "project", "task"]), fromId: z.string(), toType: z.enum(["goal", "project", "task"]), toId: z.string(), relation: z.string().max(48).optional() })).default([]),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await ensureProfile(ctx.user);
    for (const item of input.goals) await db.insert(goals).values({ id: item.id, ownerId: ctx.user.id, title: item.title, description: item.description ?? null, color: item.color ?? "#6EA8FE", entityStatus: item.status ?? "active" as const, visibility: item.visibility ?? "private" as const }).onDuplicateKeyUpdate({ set: { title: item.title, description: item.description ?? null, color: item.color ?? "#6EA8FE", entityStatus: item.status ?? "active" as const, updatedAt: new Date() } });
    for (const item of input.projects) await db.insert(projects).values({ id: item.id, ownerId: ctx.user.id, goalId: item.goalId ?? null, title: item.title, description: item.description ?? null, entityStatus: item.status ?? "active" as const, visibility: item.visibility ?? "private" as const }).onDuplicateKeyUpdate({ set: { goalId: item.goalId ?? null, title: item.title, description: item.description ?? null, entityStatus: item.status ?? "active" as const, updatedAt: new Date() } });
    for (const item of input.tasks) await db.insert(tasks).values({ id: item.id, ownerId: ctx.user.id, projectId: item.projectId ?? null, title: item.title, notes: item.notes ?? null, status: item.status ?? "todo", dueAt: item.dueAt ?? null, duePrecision: item.duePrecision ?? "unknown", importance: item.importance ?? "important", urgencyMode: item.urgencyMode ?? "auto", manualUrgent: item.manualUrgent ?? false }).onDuplicateKeyUpdate({ set: { projectId: item.projectId ?? null, title: item.title, notes: item.notes ?? null, updatedAt: new Date() } });
    for (const item of input.edges) await db.insert(relationshipEdges).values({ id: nanoid(), ownerId: ctx.user.id, ...item, relation: item.relation ?? "supports" }).onDuplicateKeyUpdate({ set: { relation: item.relation ?? "supports" } });
    return getOwnerSnapshot(ctx.user.id);
  }),
});

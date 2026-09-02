import { and, eq, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { goals, projects, relationshipEdges } from "../../drizzle/schema";
import { requireDb } from "../anchorDb";
import { protectedProcedure, router } from "../_core/trpc";

const visibility = z.enum(["private", "friends", "public"]);
const status = z.enum(["active", "paused", "completed", "archived"]);

export const planningRouter = router({
  goals: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(goals).where(eq(goals.ownerId, ctx.user.id));
  }),
  projects: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(projects).where(eq(projects.ownerId, ctx.user.id));
  }),
  edges: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(relationshipEdges).where(eq(relationshipEdges.ownerId, ctx.user.id));
  }),
  createGoal: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(5000).nullable().optional(), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(), visibility: visibility.optional() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const goal = { id: nanoid(), ownerId: ctx.user.id, title: input.title, description: input.description ?? null, color: input.color ?? "#6EA8FE", entityStatus: "active" as const, visibility: input.visibility ?? "private" as const };
    await db.insert(goals).values(goal);
    return goal;
  }),
  updateGoal: protectedProcedure.input(z.object({ id: z.string(), patch: z.object({ title: z.string().trim().min(1).max(200).optional(), description: z.string().max(5000).nullable().optional(), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(), status: status.optional(), visibility: visibility.optional() }) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.update(goals).set({ ...input.patch, updatedAt: new Date(), lastActiveAt: new Date() }).where(and(eq(goals.id, input.id), eq(goals.ownerId, ctx.user.id)));
    return input.id;
  }),
  createProject: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(200), goalId: z.string().nullable().optional(), description: z.string().max(5000).nullable().optional(), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(), visibility: visibility.optional() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const project = { id: nanoid(), ownerId: ctx.user.id, title: input.title, goalId: input.goalId ?? null, description: input.description ?? null, color: input.color ?? "#7FB5D6", entityStatus: "active" as const, visibility: input.visibility ?? "private" as const };
    await db.insert(projects).values(project);
    if (project.goalId) await db.insert(relationshipEdges).values({ id: nanoid(), ownerId: ctx.user.id, fromType: "goal", fromId: project.goalId, toType: "project", toId: project.id, relation: "supports" }).onDuplicateKeyUpdate({ set: { relation: "supports" } });
    return project;
  }),
  updateProject: protectedProcedure.input(z.object({ id: z.string(), patch: z.object({ title: z.string().trim().min(1).max(200).optional(), goalId: z.string().nullable().optional(), description: z.string().max(5000).nullable().optional(), status: status.optional(), visibility: visibility.optional(), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional() }) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.update(projects).set({ ...input.patch, updatedAt: new Date(), lastActiveAt: new Date() }).where(and(eq(projects.id, input.id), eq(projects.ownerId, ctx.user.id)));
    return input.id;
  }),
  /** 摧毁恒星：删除目标本身与关联边；其下行星脱离主线（goalId 置空），任务数据保留。 */
  deleteGoal: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const owned = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, input.id), eq(goals.ownerId, ctx.user.id))).limit(1);
    if (!owned.length) throw new TRPCError({ code: "NOT_FOUND", message: "目标不存在" });
    await db.update(projects).set({ goalId: null, updatedAt: new Date() }).where(and(eq(projects.ownerId, ctx.user.id), eq(projects.goalId, input.id)));
    await db.delete(relationshipEdges).where(and(eq(relationshipEdges.ownerId, ctx.user.id), or(and(eq(relationshipEdges.fromType, "goal"), eq(relationshipEdges.fromId, input.id)), and(eq(relationshipEdges.toType, "goal"), eq(relationshipEdges.toId, input.id)))));
    await db.delete(goals).where(and(eq(goals.id, input.id), eq(goals.ownerId, ctx.user.id)));
    return input.id;
  }),
  /** 摧毁行星：删除项目与关联边；其下任务脱离项目（projectId 置空），任务数据保留。 */
  deleteProject: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const owned = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.id), eq(projects.ownerId, ctx.user.id))).limit(1);
    if (!owned.length) throw new TRPCError({ code: "NOT_FOUND", message: "项目不存在" });
    await db.update(tasks).set({ projectId: null, updatedAt: new Date() }).where(and(eq(tasks.ownerId, ctx.user.id), eq(tasks.projectId, input.id)));
    await db.delete(relationshipEdges).where(and(eq(relationshipEdges.ownerId, ctx.user.id), or(and(eq(relationshipEdges.fromType, "project"), eq(relationshipEdges.fromId, input.id)), and(eq(relationshipEdges.toType, "project"), eq(relationshipEdges.toId, input.id)))));
    await db.delete(projects).where(and(eq(projects.id, input.id), eq(projects.ownerId, ctx.user.id)));
    return input.id;
  }),
});

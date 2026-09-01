import { and, eq } from "drizzle-orm";
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
    const goal = { id: nanoid(), ownerId: ctx.user.id, title: input.title, description: input.description ?? null, color: input.color ?? "#6EA8FE", visibility: input.visibility ?? "private" as const };
    await db.insert(goals).values(goal);
    return goal;
  }),
  updateGoal: protectedProcedure.input(z.object({ id: z.string(), patch: z.object({ title: z.string().trim().min(1).max(200).optional(), description: z.string().max(5000).nullable().optional(), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(), status: status.optional(), visibility: visibility.optional() }) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.update(goals).set({ ...input.patch, updatedAt: new Date(), lastActiveAt: new Date() }).where(and(eq(goals.id, input.id), eq(goals.ownerId, ctx.user.id)));
    return input.id;
  }),
  createProject: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(200), goalId: z.string().nullable().optional(), description: z.string().max(5000).nullable().optional(), visibility: visibility.optional() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const project = { id: nanoid(), ownerId: ctx.user.id, title: input.title, goalId: input.goalId ?? null, description: input.description ?? null, visibility: input.visibility ?? "private" as const };
    await db.insert(projects).values(project);
    if (project.goalId) await db.insert(relationshipEdges).values({ id: nanoid(), ownerId: ctx.user.id, fromType: "goal", fromId: project.goalId, toType: "project", toId: project.id, relation: "supports" }).onDuplicateKeyUpdate({ set: { relation: "supports" } });
    return project;
  }),
  updateProject: protectedProcedure.input(z.object({ id: z.string(), patch: z.object({ title: z.string().trim().min(1).max(200).optional(), goalId: z.string().nullable().optional(), description: z.string().max(5000).nullable().optional(), status: status.optional(), visibility: visibility.optional(), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional() }) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.update(projects).set({ ...input.patch, updatedAt: new Date(), lastActiveAt: new Date() }).where(and(eq(projects.id, input.id), eq(projects.ownerId, ctx.user.id)));
    return input.id;
  }),
});

import { and, eq, isNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { friendships, goals, projects, tasks, userProfiles, users, visibilityGrants } from "../../drizzle/schema";
import { ensureProfile, requireDb } from "../anchorDb";
import { protectedProcedure, router } from "../_core/trpc";

async function areFriends(viewerId: number, ownerId: number) {
  const db = await requireDb();
  const row = (await db.select().from(friendships).where(and(eq(friendships.status, "accepted"), or(and(eq(friendships.requesterId, viewerId), eq(friendships.recipientId, ownerId)), and(eq(friendships.requesterId, ownerId), eq(friendships.recipientId, viewerId))))).limit(1))[0];
  return Boolean(row);
}

async function hasGrant(ownerId: number, viewerId: number, entityType: "profile" | "goal" | "project" | "task", entityId: string | null) {
  const db = await requireDb();
  const rows = await db.select().from(visibilityGrants).where(and(eq(visibilityGrants.ownerId, ownerId), eq(visibilityGrants.viewerId, viewerId), eq(visibilityGrants.entityType, entityType), isNull(visibilityGrants.revokedAt)));
  return rows.some((grant) => grant.entityId === null || grant.entityId === entityId);
}

async function getNebulaSummary(ownerId: number, viewerId: number) {
  const db = await requireDb();
  const profile = (await db.select().from(userProfiles).where(eq(userProfiles.userId, ownerId)).limit(1))[0];
  if (!profile) throw new Error("该用户尚未建立星云档案");
  const friend = await areFriends(viewerId, ownerId);
  const profileAllowed = viewerId === ownerId || profile.defaultVisibility === "public" || (friend && profile.defaultVisibility === "friends") || await hasGrant(ownerId, viewerId, "profile", null);
  if (!profileAllowed) throw new Error("该星云默认私密");
  const [ownerGoals, ownerProjects, ownerTasks] = await Promise.all([
    db.select().from(goals).where(eq(goals.ownerId, ownerId)),
    db.select().from(projects).where(eq(projects.ownerId, ownerId)),
    db.select().from(tasks).where(eq(tasks.ownerId, ownerId)),
  ]);
  const visibleGoals = [] as Array<{ id: string; title: string; color: string; progress: number; projectCount: number }>;
  const visibleProjects = [] as Array<{ id: string; goalId: string | null; title: string; progress: number }>;
  for (const goal of ownerGoals) {
    const allowed = viewerId === ownerId || goal.visibility === "public" || (friend && goal.visibility === "friends") || await hasGrant(ownerId, viewerId, "goal", goal.id);
    if (!allowed) continue;
    const goalProjects = ownerProjects.filter((project) => project.goalId === goal.id);
    const goalTasks = ownerTasks.filter((task) => goalProjects.some((project) => project.id === task.projectId));
      visibleGoals.push({ id: goal.id, title: goal.title, color: goal.color, projectCount: goalProjects.length, progress: goalTasks.length ? Math.round((goalTasks.filter((task) => task.status === "done").length / goalTasks.length) * 100) : 0 });
  }
  for (const project of ownerProjects) {
    const allowed = viewerId === ownerId || project.visibility === "public" || (friend && project.visibility === "friends") || await hasGrant(ownerId, viewerId, "project", project.id);
    if (!allowed) continue;
    const projectTasks = ownerTasks.filter((task) => task.projectId === project.id);
    visibleProjects.push({ id: project.id, goalId: project.goalId, title: project.title, progress: projectTasks.length ? Math.round((projectTasks.filter((task) => task.status === "done").length / projectTasks.length) * 100) : 0 });
  }
  return { profile: { displayName: profile.displayName, bio: profile.bio, avatarUrl: profile.avatarUrl }, goals: visibleGoals, projects: visibleProjects, generatedAt: new Date() };
}

export const socialRouter = router({
  discover: protectedProcedure.input(z.object({ query: z.string().trim().max(100).optional() })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const rows = await db.select({ userId: userProfiles.userId, displayName: userProfiles.displayName, bio: userProfiles.bio, avatarUrl: userProfiles.avatarUrl }).from(userProfiles).where(eq(userProfiles.discoverable, true));
    const query = input.query?.toLocaleLowerCase() ?? "";
    return rows.filter((row) => row.userId !== ctx.user.id && (!query || `${row.displayName ?? ""} ${row.bio ?? ""}`.toLowerCase().includes(query))).slice(0, 20);
  }),
  friendships: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(friendships).where(or(eq(friendships.requesterId, ctx.user.id), eq(friendships.recipientId, ctx.user.id)));
  }),
  requestFriend: protectedProcedure.input(z.object({ recipientId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (input.recipientId === ctx.user.id) throw new Error("不能添加自己为好友");
    const db = await requireDb();
    const reverse = (await db.select().from(friendships).where(and(eq(friendships.requesterId, input.recipientId), eq(friendships.recipientId, ctx.user.id))).limit(1))[0];
    if (reverse?.status === "pending") {
      await db.update(friendships).set({ status: "accepted" }).where(eq(friendships.id, reverse.id));
      return { ...reverse, status: "accepted" as const };
    }
    const relation = { id: nanoid(), requesterId: ctx.user.id, recipientId: input.recipientId, status: "pending" as const };
    await db.insert(friendships).values(relation).onDuplicateKeyUpdate({ set: { status: "pending", updatedAt: new Date() } });
    return relation;
  }),
  respondFriend: protectedProcedure.input(z.object({ id: z.string(), accept: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const relation = (await db.select().from(friendships).where(and(eq(friendships.id, input.id), eq(friendships.recipientId, ctx.user.id))).limit(1))[0];
    if (!relation) throw new Error("好友请求不存在");
    await db.update(friendships).set({ status: input.accept ? "accepted" : "blocked" }).where(eq(friendships.id, input.id));
    return { ...relation, status: input.accept ? "accepted" as const : "blocked" as const };
  }),
  setVisibility: protectedProcedure.input(z.object({ entityType: z.enum(["profile", "goal", "project", "task"]), entityId: z.string().nullable().optional(), visibility: z.enum(["private", "friends", "public"]) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    if (input.entityType === "profile") {
      await ensureProfile(ctx.user);
      await db.update(userProfiles).set({ defaultVisibility: input.visibility }).where(eq(userProfiles.userId, ctx.user.id));
    } else if (input.entityType === "goal" && input.entityId) await db.update(goals).set({ visibility: input.visibility }).where(and(eq(goals.id, input.entityId), eq(goals.ownerId, ctx.user.id)));
    else if (input.entityType === "project" && input.entityId) await db.update(projects).set({ visibility: input.visibility }).where(and(eq(projects.id, input.entityId), eq(projects.ownerId, ctx.user.id)));
    else if (input.entityType === "task" && input.entityId) await db.update(tasks).set({ visibility: input.visibility }).where(and(eq(tasks.id, input.entityId), eq(tasks.ownerId, ctx.user.id)));
    return { ...input };
  }),
  grant: protectedProcedure.input(z.object({ viewerId: z.number().int().positive(), entityType: z.enum(["profile", "goal", "project", "task"]), entityId: z.string().nullable().optional(), permission: z.enum(["summary", "details"]).default("summary") })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const grant = { id: nanoid(), ownerId: ctx.user.id, viewerId: input.viewerId, entityType: input.entityType, entityId: input.entityId ?? null, permission: input.permission };
    await db.insert(visibilityGrants).values(grant).onDuplicateKeyUpdate({ set: { permission: input.permission, revokedAt: null } });
    return grant;
  }),
  revoke: protectedProcedure.input(z.object({ viewerId: z.number().int().positive(), entityType: z.enum(["profile", "goal", "project", "task"]), entityId: z.string().nullable().optional() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const rows = await db.select().from(visibilityGrants).where(and(eq(visibilityGrants.ownerId, ctx.user.id), eq(visibilityGrants.viewerId, input.viewerId), eq(visibilityGrants.entityType, input.entityType)));
    const match = rows.find((row) => row.entityId === (input.entityId ?? null));
    if (match) await db.update(visibilityGrants).set({ revokedAt: new Date() }).where(eq(visibilityGrants.id, match.id));
    return { revoked: Boolean(match) };
  }),
  revokeAllForViewer: protectedProcedure.input(z.object({ viewerId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.update(visibilityGrants).set({ revokedAt: new Date() }).where(and(eq(visibilityGrants.ownerId, ctx.user.id), eq(visibilityGrants.viewerId, input.viewerId), isNull(visibilityGrants.revokedAt)));
    return { revoked: true };
  }),
  nebula: protectedProcedure.input(z.object({ ownerId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    return getNebulaSummary(input.ownerId, ctx.user.id);
  }),
  previewAsFriend: protectedProcedure.input(z.object({ friendId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    if (!await areFriends(ctx.user.id, input.friendId)) throw new Error("仅能以已接受好友身份预览");
    return getNebulaSummary(ctx.user.id, input.friendId);
  }),
});

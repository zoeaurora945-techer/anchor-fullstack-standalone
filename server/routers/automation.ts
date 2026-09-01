import { parse as parseCookie } from "cookie";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { scheduledJobs } from "../../drizzle/schema";
import { COOKIE_NAME } from "../../shared/const";
import { ensureProfile, requireDb } from "../anchorDb";
import { createHeartbeatJob, updateHeartbeatJob } from "../_core/heartbeat";
import { protectedProcedure, router } from "../_core/trpc";

const jobKind = z.enum(["time_facts", "weekly_preview", "weekly_final"]);
export const cronByKind = {
  time_facts: "0 */5 * * * *",
  // Asia/Shanghai defaults: Sat 20:00 and the following Mon 00:05, expressed in UTC.
  weekly_preview: "0 0 12 * * 6",
  weekly_final: "0 5 16 * * 0",
} as const;

export const automationRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(scheduledJobs).where(eq(scheduledJobs.ownerId, ctx.user.id));
  }),
  configure: protectedProcedure.input(z.object({ kind: jobKind, enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const profile = await ensureProfile(ctx.user);
    const existing = (await db.select().from(scheduledJobs).where(and(eq(scheduledJobs.ownerId, ctx.user.id), eq(scheduledJobs.kind, input.kind))).limit(1))[0];
    const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
    if (!sessionToken) throw new Error("需要有效登录会话才能配置定时任务");
    if (existing?.scheduleCronTaskUid) {
      await updateHeartbeatJob(existing.scheduleCronTaskUid, { enable: input.enabled, cron: cronByKind[input.kind] }, sessionToken);
      await db.update(scheduledJobs).set({ enabled: input.enabled, timezone: profile.timezone }).where(eq(scheduledJobs.id, existing.id));
      return { ...existing, enabled: input.enabled };
    }
    if (!input.enabled) {
      const row = { id: nanoid(), ownerId: ctx.user.id, kind: input.kind, timezone: profile.timezone, enabled: false, scheduleCronTaskUid: null };
      await db.insert(scheduledJobs).values(row);
      return row;
    }
    const job = await createHeartbeatJob({
      name: `anchor-${ctx.user.id}-${input.kind}`,
      cron: cronByKind[input.kind],
      path: "/api/scheduled/anchor",
      payload: { kind: input.kind },
      description: `Anchor ${input.kind} for user ${ctx.user.id}`,
    }, sessionToken);
    const row = { id: nanoid(), ownerId: ctx.user.id, kind: input.kind, timezone: profile.timezone, enabled: true, scheduleCronTaskUid: job.taskUid };
    await db.insert(scheduledJobs).values(row);
    return row;
  }),
  ensureDefaults: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const profile = await ensureProfile(ctx.user);
    const existing = await db.select().from(scheduledJobs).where(eq(scheduledJobs.ownerId, ctx.user.id));
    if (!existing.some((j) => j.kind === "time_facts")) {
      await db.insert(scheduledJobs).values({
        id: nanoid(),
        ownerId: ctx.user.id,
        kind: "time_facts",
        timezone: profile.timezone,
        enabled: true,
        scheduleCronTaskUid: null,
      });
    }
    return db.select().from(scheduledJobs).where(eq(scheduledJobs.ownerId, ctx.user.id));
  }),
});

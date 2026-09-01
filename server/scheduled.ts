import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { scheduledJobs, userProfiles } from "../drizzle/schema";
import { materializeTimeFacts, requireDb } from "./anchorDb";
import { materializeWeeklyReport } from "./weeklyService";
import { authenticateRequest } from "./_core/sdk";

/**
 * Handle scheduled cron jobs.
 * These are called by the internal scheduler (node-cron), not by users.
 */
export async function handleScheduledAnchorJob(req: Request, res: Response) {
  try {
    // Check for internal auth header (set by scheduler)
    const internalKey = req.headers["x-internal-key"];
    const expectedKey = process.env.INTERNAL_SCHEDULER_KEY ?? "anchor-internal";
    if (internalKey !== expectedKey) {
      return res.status(403).json({ error: "unauthorized" });
    }

    const db = await requireDb();
    const jobs = await db.select().from(scheduledJobs)
      .where(eq(scheduledJobs.enabled, true));

    for (const job of jobs) {
      if (job.kind === "time_facts") {
        const count = await materializeTimeFacts(job.ownerId);
        console.log(`[Scheduler] time_facts for user ${job.ownerId}: ${count} facts`);
      } else if (job.kind === "weekly_preview") {
        await materializeWeeklyReport(job.ownerId, "preview");
        console.log(`[Scheduler] weekly_preview for user ${job.ownerId}`);
      } else if (job.kind === "weekly_final") {
        await materializeWeeklyReport(job.ownerId, "final");
        console.log(`[Scheduler] weekly_final for user ${job.ownerId}`);
      }
    }

    return res.json({ ok: true, processed: jobs.length });
  } catch (error) {
    return res.status(500).json({ error: String(error), timestamp: new Date().toISOString(), context: { path: req.path } });
  }
}

export async function checkAllUsersTimeFacts() {
  const db = await requireDb();
  const profiles = await db.select({ userId: userProfiles.userId }).from(userProfiles);
  let materialized = 0;
  for (const profile of profiles) materialized += await materializeTimeFacts(profile.userId);
  return materialized;
}

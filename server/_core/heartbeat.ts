import { TRPCError } from "@trpc/server";
import cron from "node-cron";
import * as db from "../db";
import { scheduledJobs } from "../../drizzle/schema";

export type HeartbeatJob = {
  name: string;
  /**
   * 6-field cron expression (min hour dom mon dow), UTC.
   * e.g. "0 0 9 * * *" is daily 09:00 UTC.
   */
  cron: string;
  /** Callback path. MUST start with `/api/scheduled/`. */
  path: string;
  method?: "POST" | "PUT";
  payload?: unknown;
  description?: string;
};

export type HeartbeatJobUpdate = Partial<Omit<HeartbeatJob, "name">> & {
  enable?: boolean;
};

export type HeartbeatJobInfo = {
  taskUid: string;
  name: string;
  userId: string;
  description: string;
  cronExpression: string;
  callbackPath: string;
  callbackMethod: string;
  callbackPayload: string;
  isEnable: boolean;
  createdAt?: string | null;
  lastExecutedAt?: string | null;
  nextExecutionAt?: string | null;
};

// Keep track of running cron tasks
const cronTasks = new Map<string, cron.ScheduledTask>();

/**
 * Create a new cron job.
 */
export async function createHeartbeatJob(
  job: HeartbeatJob,
  _userSession: string
): Promise<{ taskUid: string; nextExecutionAt?: string | null }> {
  const { nanoid } = await import("nanoid");
  const taskUid = nanoid();

  const task = cron.schedule(job.cron, async () => {
    try {
      const method = (job.method ?? "POST").toLowerCase();
      const body = job.payload ? JSON.stringify(job.payload) : undefined;
      // Use the same fetch API to call the callback
      const url = `${process.env.BASE_URL ?? "http://localhost:3000"}${job.path}`;
      await fetch(url, {
        method: method.toUpperCase(),
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": process.env.INTERNAL_SCHEDULER_KEY ?? "anchor-internal",
        },
        body,
      });
    } catch (error) {
      console.error(`[Heartbeat] Job ${job.name} failed:`, error);
    }
  });

  cronTasks.set(taskUid, task);
  task.start();

  // Calculate next execution
  const nextExec = await calculateNextExecution(job.cron);

  // Save to DB
  const dbConn = await db.getDb();
  if (dbConn) {
    await dbConn.insert(scheduledJobs).values({
      id: taskUid,
      ownerId: "", // Will be set by caller
      kind: "heartbeat",
      scheduleCronTaskUid: taskUid,
      scheduleCron: job.cron,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onDuplicateKeyUpdate({ set: { enabled: true, updatedAt: new Date() } });
  }

  return { taskUid, nextExecutionAt: nextExec };
}

async function calculateNextExecution(cronExpr: string): Promise<string | null> {
  try {
    const schedule = cron.parseExpression(cronExpr);
    const next = schedule.next();
    return next.toISOString();
  } catch {
    return null;
  }
}

/**
 * Update an existing cron job.
 */
export async function updateHeartbeatJob(
  taskUid: string,
  patch: HeartbeatJobUpdate,
  _userSession: string
): Promise<{ nextExecutionAt?: string | null }> {
  const task = cronTasks.get(taskUid);
  if (!task) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  }

  if (patch.enable === false) {
    task.stop();
    cronTasks.delete(taskUid);
    const dbConn = await db.getDb();
    if (dbConn) {
      await dbConn.update(scheduledJobs)
        .set({ enabled: false, updatedAt: new Date() })
        .where(scheduledJobs.scheduleCronTaskUid.eq(taskUid));
    }
    return { nextExecutionAt: null };
  }

  if (patch.cron) {
    task.stop();
    cronTasks.delete(taskUid);
    // Re-create with new cron
    const newTask = cron.schedule(patch.cron, async () => {
      // Re-call the original callback
      const dbConn = await db.getDb();
      if (dbConn) {
        const job = (await dbConn.select()
          .from(scheduledJobs)
          .where(scheduledJobs.scheduleCronTaskUid.eq(taskUid))
          .limit(1))[0];
        if (job?.enabled) {
          const url = `${process.env.BASE_URL ?? "http://localhost:3000"}${job.scheduleCallbackPath}`;
          await fetch(url, { method: "POST" });
        }
      }
    });
    cronTasks.set(taskUid, newTask);
    newTask.start();
  }

  const nextExec = await calculateNextExecution(patch.cron || "");
  return { nextExecutionAt: nextExec };
}

/**
 * Delete a cron job.
 */
export async function deleteHeartbeatJob(
  taskUid: string,
  _userSession: string
): Promise<void> {
  const task = cronTasks.get(taskUid);
  if (task) {
    task.stop();
    cronTasks.delete(taskUid);
  }
  const dbConn = await db.getDb();
  if (dbConn) {
    await dbConn.delete(scheduledJobs)
      .where(scheduledJobs.scheduleCronTaskUid.eq(taskUid));
  }
}

/**
 * List cron jobs.
 */
export async function listHeartbeatJobs(
  _userSession: string,
  _pagination?: { page?: number; pageSize?: number }
): Promise<{ total: number; actorUserId: string; jobs: HeartbeatJobInfo[] }> {
  const dbConn = await db.getDb();
  if (!dbConn) return { total: 0, actorUserId: "", jobs: [] };

  const rows = await dbConn.select()
    .from(scheduledJobs)
    .orderBy(scheduledJobs.createdAt);

  const jobs: HeartbeatJobInfo[] = rows.map(row => ({
    taskUid: row.scheduleCronTaskUid,
    name: row.scheduleCronTaskUid,
    userId: row.ownerId,
    description: "",
    cronExpression: row.scheduleCron,
    callbackPath: row.scheduleCallbackPath ?? "",
    callbackMethod: "POST",
    callbackPayload: "{}",
    isEnable: row.enabled,
    createdAt: row.createdAt,
    lastExecutedAt: null,
    nextExecutionAt: null,
  }));

  return { total: jobs.length, actorUserId: "", jobs };
}

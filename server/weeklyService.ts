import { and, eq, gte, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { projects, tasks, timeEntries, weeklyReports } from "../drizzle/schema";
import { requireDb } from "./anchorDb";

export function mondayUtc(value = new Date()): Date {
  const copy = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const offset = (copy.getUTCDay() + 6) % 7;
  copy.setUTCDate(copy.getUTCDate() - offset);
  return copy;
}

export async function buildWeeklySnapshot(ownerId: number, weekStartAt: Date) {
  const db = await requireDb();
  const weekEndAt = new Date(weekStartAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [completed, entries, ownerProjects] = await Promise.all([
    db.select().from(tasks).where(and(eq(tasks.ownerId, ownerId), gte(tasks.doneAt, weekStartAt), lt(tasks.doneAt, weekEndAt))),
    db.select().from(timeEntries).where(and(eq(timeEntries.ownerId, ownerId), gte(timeEntries.startedAt, weekStartAt), lt(timeEntries.startedAt, weekEndAt))),
    db.select().from(projects).where(eq(projects.ownerId, ownerId)),
  ]);
  const projectNames = new Map(ownerProjects.map((project) => [project.id, project.title]));
  const perProject = new Map<string, { projectId: string | null; projectTitle: string; completedTasks: number; minutes: number }>();
  const add = (projectId: string | null, kind: "completedTasks" | "minutes", value: number) => {
    const key = projectId ?? "unassigned";
    const current = perProject.get(key) ?? { projectId, projectTitle: projectId ? projectNames.get(projectId) ?? "未命名项目" : "未归属成果", completedTasks: 0, minutes: 0 };
    current[kind] += value;
    perProject.set(key, current);
  };
  completed.forEach((task) => add(task.projectId, "completedTasks", 1));
  entries.forEach((entry) => add(entry.projectId, "minutes", entry.durationMinutes));
  return {
    weekStartAt, weekEndAt,
    completedTaskCount: completed.length,
    recordedMinutes: entries.reduce((sum, entry) => sum + entry.durationMinutes, 0),
    projectsAdvanced: Array.from(perProject.values()).filter((item) => item.projectId !== null && item.completedTasks > 0).length,
    projectBreakdown: Array.from(perProject.values()).sort((a, b) => b.minutes - a.minutes || b.completedTasks - a.completedTasks),
  };
}

export async function materializeWeeklyReport(ownerId: number, kind: "preview" | "final", sourceDate = new Date()) {
  const db = await requireDb();
  const weekStartAt = mondayUtc(sourceDate);
  const snapshot = await buildWeeklySnapshot(ownerId, weekStartAt);
  await db.insert(weeklyReports).values({ id: nanoid(), ownerId, weekStartAt, kind, snapshot }).onDuplicateKeyUpdate({ set: { snapshot, generatedAt: new Date() } });
  return snapshot;
}

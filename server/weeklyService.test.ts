import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireDbMock } = vi.hoisted(() => ({ requireDbMock: vi.fn() }));
vi.mock("./anchorDb", () => ({ requireDb: requireDbMock }));

import { buildWeeklySnapshot } from "./weeklyService";

function queryRows(rows: unknown[]) {
  return { from: () => ({ where: () => Promise.resolve(rows) }) };
}

describe("weekly outcomes", () => {
  beforeEach(() => {
    const db = { select: vi.fn() };
    db.select
      .mockReturnValueOnce(queryRows([{ id: "task-1", projectId: "project-1" }, { id: "task-2", projectId: null }]))
      .mockReturnValueOnce(queryRows([{ id: "time-1", projectId: "project-1", durationMinutes: 90 }]))
      .mockReturnValueOnce(queryRows([{ id: "project-1", title: "动态宇宙" }]));
    requireDbMock.mockResolvedValue(db);
  });

  it("groups completed results and recorded minutes by project", async () => {
    const snapshot = await buildWeeklySnapshot(1, new Date("2026-08-17T00:00:00.000Z"));
    expect(snapshot.completedTaskCount).toBe(2);
    expect(snapshot.recordedMinutes).toBe(90);
    expect(snapshot.projectsAdvanced).toBe(1);
    expect(snapshot.projectBreakdown).toContainEqual({ projectId: "project-1", projectTitle: "动态宇宙", completedTasks: 1, minutes: 90 });
    expect(snapshot.projectBreakdown).toContainEqual({ projectId: null, projectTitle: "未归属成果", completedTasks: 1, minutes: 0 });
  });
});

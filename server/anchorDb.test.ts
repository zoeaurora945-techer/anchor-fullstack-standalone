import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("./db", () => ({ getDb: getDbMock }));

import { completeOrDropTask, materializeTimeFacts } from "./anchorDb";

function queryRows(rows: unknown[]) {
  return { from: () => ({ where: () => ({ limit: () => Promise.resolve(rows), then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) }) }) };
}

describe("server time facts", () => {
  const insertOnDuplicate = vi.fn().mockResolvedValue(undefined);
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  let db: any;

  beforeEach(() => {
    vi.clearAllMocks();
    db = {
      select: vi.fn(),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ onDuplicateKeyUpdate: insertOnDuplicate })) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: updateWhere })) })),
    };
    getDbMock.mockResolvedValue(db);
  });

  it("writes one idempotent breach fact and preserves the original dueAt", async () => {
    const dueAt = new Date("2026-08-20T01:00:00.000Z");
    db.select.mockReturnValue(queryRows([{ id: "task-1", dueAt }]));
    const now = new Date("2026-08-20T02:00:00.000Z");
    await expect(materializeTimeFacts(8, now)).resolves.toBe(1);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalledTimes(1);
    const values = db.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(values.type).toBe("breached");
    expect(values.dueAtSnapshot).toEqual(dueAt);
    expect(values.idempotencyKey).toBe(`breach:task-1:${dueAt.getTime()}`);
  });

  it("records a late completion without changing the historical deadline", async () => {
    const dueAt = new Date("2026-08-20T01:00:00.000Z");
    const openTask = { id: "task-2", ownerId: 8, status: "doing", dueAt, firstBreachedAt: null };
    const completedTask = { ...openTask, status: "done", doneAt: new Date("2026-08-20T02:00:00.000Z") };
    db.select.mockReturnValueOnce(queryRows([openTask])).mockReturnValueOnce(queryRows([completedTask]));
    const result = await completeOrDropTask({ ownerId: 8, taskId: "task-2", status: "done", now: completedTask.doneAt });
    expect(result.status).toBe("done");
    const values = db.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(values.type).toBe("completed_late");
    expect(values.dueAtSnapshot).toEqual(dueAt);
  });
});

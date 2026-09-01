import { beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "../../shared/const";

const mocks = vi.hoisted(() => ({
  requireDb: vi.fn(), ensureProfile: vi.fn(), getOwnerSnapshot: vi.fn(), materializeTimeFacts: vi.fn(), completeOrDropTask: vi.fn(),
  createTasksFromNaturalInput: vi.fn(), createHeartbeatJob: vi.fn(), updateHeartbeatJob: vi.fn(),
}));
vi.mock("../anchorDb", () => ({ requireDb: mocks.requireDb, ensureProfile: mocks.ensureProfile, getOwnerSnapshot: mocks.getOwnerSnapshot, materializeTimeFacts: mocks.materializeTimeFacts, completeOrDropTask: mocks.completeOrDropTask }));
vi.mock("../aiTaskService", () => ({ createTasksFromNaturalInput: mocks.createTasksFromNaturalInput }));
vi.mock("../_core/heartbeat", () => ({ createHeartbeatJob: mocks.createHeartbeatJob, updateHeartbeatJob: mocks.updateHeartbeatJob }));

import { aiRouter } from "./ai";
import { automationRouter } from "./automation";
import { syncRouter } from "./sync";
import { taskRouter } from "./tasks";
import { timeRouter } from "./time";

const user = { id: 11, openId: "route-test", name: "Router Test", email: null, loginMethod: null, role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const ctx = { user, req: { headers: { cookie: `${COOKIE_NAME}=test-session` } } } as any;
function noRows() { return { from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }; }

describe("core tRPC route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureProfile.mockResolvedValue({ timezone: "Asia/Shanghai" });
    mocks.getOwnerSnapshot.mockResolvedValue({ tasks: [], pulledAt: new Date("2026-08-25T00:00:00.000Z") });
    mocks.materializeTimeFacts.mockResolvedValue(0);
    mocks.completeOrDropTask.mockResolvedValue({ id: "task-1", status: "done" });
    mocks.createTasksFromNaturalInput.mockResolvedValue({ tasks: [{ id: "task-ai" }], usedFallback: false });
    mocks.requireDb.mockResolvedValue({
      select: vi.fn(() => noRows()),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    });
  });

  it("pulls an owner-scoped cloud snapshot", async () => {
    const result = await syncRouter.createCaller(ctx).pull({});
    expect(mocks.ensureProfile).toHaveBeenCalledWith(user);
    expect(mocks.getOwnerSnapshot).toHaveBeenCalledWith(user.id, undefined);
    expect(result.tasks).toEqual([]);
  });

  it("persists a manual quadrant move over automatic urgency", async () => {
    const result = await taskRouter.createCaller(ctx).move({ id: "task-1", quadrant: "q2" });
    expect(result).toEqual({ id: "task-1", importance: "not_important", urgencyMode: "manual", manualUrgent: true });
  });

  it("starts a server-persisted active timer when none exists", async () => {
    const timer = await timeRouter.createCaller(ctx).start({ projectId: "project-1" });
    expect(timer.ownerId).toBe(user.id);
    expect(timer.projectId).toBe("project-1");
  });

  it("routes low-friction text capture through the server AI service", async () => {
    const result = await aiRouter.createCaller(ctx).captureText({ text: "明天整理周报", language: "zh" });
    expect(mocks.createTasksFromNaturalInput).toHaveBeenCalledWith(user, "明天整理周报", "zh");
    expect(result.tasks[0]?.id).toBe("task-ai");
  });

  it("stores a disabled schedule without requiring a live Heartbeat task", async () => {
    const result = await automationRouter.createCaller(ctx).configure({ kind: "weekly_preview", enabled: false });
    expect(result.enabled).toBe(false);
    expect(mocks.createHeartbeatJob).not.toHaveBeenCalled();
  });
});

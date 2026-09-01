import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireDbMock } = vi.hoisted(() => ({ requireDbMock: vi.fn() }));
vi.mock("../anchorDb", () => ({ requireDb: requireDbMock, ensureProfile: vi.fn() }));

import { socialRouter } from "./social";

function rows(value: unknown[]) {
  return { from: () => ({ where: () => ({ limit: () => Promise.resolve(value), then: (resolve: (result: unknown[]) => unknown) => Promise.resolve(value).then(resolve) }) }) };
}

describe("social friendship routing", () => {
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const ctx = { user: { id: 7, openId: "u7", name: "Tester", email: null, loginMethod: null, role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    requireDbMock.mockResolvedValue({
      select: vi.fn(() => rows([{ id: "friend-1", requesterId: 3, recipientId: 7, status: "pending" }])),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: updateWhere })) })),
    });
  });

  it("allows the recipient to accept a pending request", async () => {
    const caller = socialRouter.createCaller(ctx);
    const result = await caller.respondFriend({ id: "friend-1", accept: true });
    expect(result.status).toBe("accepted");
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });
});

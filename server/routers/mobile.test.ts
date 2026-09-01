import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createSessionToken: vi.fn() }));
vi.mock("../_core/sdk", () => ({ sdk: { createSessionToken: mocks.createSessionToken } }));
import { mobileRouter } from "./mobile";

describe("mobile pairing router", () => {
  it("issues a deliberately requested, named 30-day bearer session", async () => {
    mocks.createSessionToken.mockResolvedValue("pairing-token");
    const result = await mobileRouter.createCaller({ user: { id: 1, openId: "mobile-owner" }, req: {}, res: {} } as any).issuePairingSession({ deviceName: "Zoe's mini-program" });
    expect(mocks.createSessionToken).toHaveBeenCalledWith("mobile-owner", expect.objectContaining({ name: "Zoe's mini-program", expiresInMs: 30 * 24 * 60 * 60 * 1000 }));
    expect(result.token).toBe("pairing-token");
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { createSessionToken } from "../_core/sdk";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** A user must deliberately request this from an authenticated Web session. The token is never persisted server-side. */
export const mobileRouter = router({
  issuePairingSession: protectedProcedure.input(z.object({ deviceName: z.string().trim().min(1).max(60).default("Taro mini-program") })).mutation(async ({ ctx, input }) => {
    const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS);
    const token = await createSessionToken(ctx.user.openId, input.deviceName, THIRTY_DAYS_MS);
    return { token, expiresAt, deviceName: input.deviceName };
  }),
});

import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { syncRouter } from "./routers/sync";
import { taskRouter } from "./routers/tasks";
import { timeRouter } from "./routers/time";
import { socialRouter } from "./routers/social";
import { aiRouter } from "./routers/ai";
import { planningRouter } from "./routers/planning";
import { automationRouter } from "./routers/automation";
import { mobileRouter } from "./routers/mobile";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  sync: syncRouter,
  task: taskRouter,
  time: timeRouter,
  social: socialRouter,
  ai: aiRouter,
  planning: planningRouter,
  automation: automationRouter,
  mobile: mobileRouter,
});

export type AppRouter = typeof appRouter;

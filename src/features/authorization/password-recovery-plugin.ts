import "server-only";

import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { z } from "zod";
import { redeemPasswordRecoveryCode } from "./password-recovery-service";

export function passwordRecovery() {
  return {
    id: "password-recovery",
    endpoints: {
      recoverPassword: createAuthEndpoint("/recover-password", {
        method: "POST",
        body: z.object({ code: z.string().min(1).max(128) }),
      }, async (ctx) => {
        const token = await redeemPasswordRecoveryCode(ctx.body.code);
        if (!token) throw new APIError("BAD_REQUEST", { code: "INVALID_RECOVERY_CODE", message: "This recovery code is invalid or has already been used. Try another saved code." });
        ctx.setHeader("Cache-Control", "no-store");
        return ctx.json({ token });
      }),
    },
    rateLimit: [{ pathMatcher: (path) => path === "/recover-password", window: 60, max: 5 }],
  } satisfies BetterAuthPlugin;
}

import "server-only";
import { ZodError } from "zod";
import { requireSession } from "@/lib/server-access";
import { WorldError } from "./world-service";
export function privateJson(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } }); }
export async function worldRequest(request: Request, mutation: boolean, run: (userId: string) => Promise<unknown>) {
  try {
    // Next's internal request URL can use localhost while the browser uses the
    // actual site hostname. Compare the browser Origin with the request Host.
    if (mutation) {
      const origin = request.headers.get("origin");
      let originHost: string | undefined;
      try { if (origin) { const parsed = new URL(origin); if (parsed.protocol === "http:" || parsed.protocol === "https:") originHost = parsed.host; } } catch { /* Reject an invalid origin. */ }
      if (!originHost || originHost !== request.headers.get("host")) throw new WorldError("This request must come from this site.", 403);
    }
    const session = await requireSession().catch(() => { throw new WorldError("Sign in to access Worlds.", 401); });
    return privateJson(await run(session.user.id));
  } catch (error) {
    if (error instanceof WorldError) return privateJson({ error: error.message }, error.status);
    if (error instanceof ZodError) return privateJson({ error: error.issues.map((issue) => issue.message).join(" ") }, 400);
    if (error instanceof SyntaxError) return privateJson({ error: "The submitted details could not be read." }, 400);
    console.error("Worlds request failed", error);
    return privateJson({ error: "Worlds could not save or load right now. Your draft is retained; try again." }, 500);
  }
}

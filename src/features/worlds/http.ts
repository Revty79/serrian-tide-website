import "server-only";
import { randomUUID } from "node:crypto";
import { readOnlyPreview } from "./knowledge-preview";
import { ZodError } from "zod";
import { requireSession } from "@/lib/server-access";
import { WorldError } from "./world-service";
import { atlasUnavailableMessage, isMapOnlyWorldsApi } from "./atlas-availability";
import { withWorldRequestAuthority } from "./world-authorization-context";
import { worldEditorProofSchema } from "./world-permissions";
import { authorizeWorldRead, revalidateWorldResponse } from "./world-access-service";
import { worldRequestAuthority } from "./world-authorization-context";
import { projectWorldContent } from "./world-content-projection";
import { projectWorldPinnedContent } from "./world-pinned-content";
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
    // Block every retained map route before parsing bodies, loading sources or writing.
    // Shared lore, History, calendar and Campaign endpoints retain their own guards.
    if (isMapOnlyWorldsApi(new URL(request.url).pathname)) throw new WorldError(atlasUnavailableMessage, 404);
    const expectedActor=request.headers.get("X-World-Actor");
    if(expectedActor!==null&&expectedActor!==session.user.id)throw new WorldError("The signed-in account changed. Your original draft is retained; reload before submitting from this account.",409);
    if(mutation&&readOnlyPreview(new URL(request.url).searchParams))throw new WorldError("This preview is read-only.",403);
    const url=new URL(request.url);
    const rawProof=request.headers.get("x-world-editor");
    if(rawProof&&rawProof.length>1024)throw new WorldError("The editing credentials could not be read. Your draft is retained.",400);
    const proof=rawProof?worldEditorProofSchema.parse(JSON.parse(rawProof)):null;
    return await withWorldRequestAuthority({userId:session.user.id,sessionId:session.session.id,proof,review:url.searchParams.get("review")==="1",operationId:randomUUID(),reads:new Map()},async()=>{
      const worldId=url.pathname.match(/^\/api\/worlds\/([a-f0-9-]{36})(?:\/|$)/i)?.[1];
      if(worldId){const parent=await authorizeWorldRead(session.user.id,worldId,url.searchParams.get("review")==="1","shell");if(mutation&&(parent.permission.role==="viewer"||parent.permission.role==="administrator-review"))throw new WorldError("This World access is read-only.",403);}
      const result=url.searchParams.has("historicalAtlas")&&!url.pathname.endsWith("/terrain/transfers")
        ?await (await import("./native-map-history-api")).nativeContentRequest(request,session.user.id)
        :await run(session.user.id);
      const permission=worldId?worldRequestAuthority()?.reads.get(worldId)?.permission:undefined;
      const projected=!(result instanceof Response)&&permission&&worldId?projectWorldContent(await projectWorldPinnedContent(result,worldId,url.searchParams.get("timeline")??url.searchParams.get("timelineId")??(url.searchParams.has("historicalAtlas")?JSON.parse(url.searchParams.get("historicalAtlas")!).timelineId:undefined)),permission):result;
      await revalidateWorldResponse();
      if(result instanceof Response){result.headers.set("Cache-Control","private, no-store");result.headers.set("Vary","Cookie");result.headers.set("X-Content-Type-Options","nosniff");result.headers.set("X-World-Actor",session.user.id);return result;}
      const response=privateJson(projected);response.headers.set("X-World-Actor",session.user.id);return response;
    });
  } catch (error) {
    if (error instanceof WorldError) return privateJson({ error: error.message }, error.status);
    if (error instanceof ZodError) return privateJson({ error: error.issues.map((issue) => issue.message).join(" ") }, 400);
    if (error instanceof SyntaxError) return privateJson({ error: "The submitted details could not be read." }, 400);
    console.error("Worlds request failed", {kind:error instanceof Error?error.name:typeof error});
    return privateJson({ error: "Worlds could not save or load right now. Your draft is retained; try again." }, 500);
  }
}

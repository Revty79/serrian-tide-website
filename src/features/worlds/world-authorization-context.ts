import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { WorldEditorProof, WorldOperationScope, WorldPermission } from "./world-permissions";
import type { world } from "@/db/world-schema";

export type WorldRequestAuthority = {
  userId: string;
  sessionId: string;
  review: boolean;
  operationId: string;
  proof: WorldEditorProof | null;
  reads: Map<string, { scopes: Set<WorldOperationScope>; permission: WorldPermission; row?:typeof world.$inferSelect }>;
  contributions?: {worldId:string;family:string;entityId:string;versionId:string;timelineId:string}[];
};
const context = new AsyncLocalStorage<WorldRequestAuthority>();
export function worldRequestAuthority() { return context.getStore(); }
export function withWorldRequestAuthority<T>(authority: WorldRequestAuthority, run: () => T): T { return context.run(authority, run); }
export function recordWorldContribution(value:NonNullable<WorldRequestAuthority["contributions"]>[number]){const authority=context.getStore();if(authority)(authority.contributions??=[]).push(value);}


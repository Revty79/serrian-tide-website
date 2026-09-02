import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ChatError } from "@/features/chat/chat";
import { getChatWorkspaceBootstrap } from "@/features/chat/chat-service";
import { requireSession } from "@/lib/server-access";

import { ChatWorkspace } from "./chat-workspace";

export const metadata: Metadata = {
  title: "The Crossroads | Serrian Tide",
  description: "Serrian Tide's role-neutral communication center.",
};

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string | string[] }>;
}) {
  const session = await requireSession().catch(() => redirect("/login"));
  const query = await searchParams;
  const requestedRoomSlug = typeof query.room === "string" ? query.room : null;

  let bootstrap;
  try {
    bootstrap = await getChatWorkspaceBootstrap(session.user.id, requestedRoomSlug);
  } catch (error) {
    if (error instanceof ChatError && (
      error.code === "AUTH_REQUIRED" || error.code === "ACCESS_DENIED"
    )) redirect("/access");
    throw error;
  }

  return <ChatWorkspace initialBootstrap={bootstrap} />;
}

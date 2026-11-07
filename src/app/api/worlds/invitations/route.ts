import { worldRequest } from "@/features/worlds/http";
import { decideWorldInvitation, worldInvitationInbox } from "@/features/worlds/world-collaboration-service";
export const dynamic="force-dynamic";
export async function GET(request:Request){return worldRequest(request,false,async userId=>({invitations:await worldInvitationInbox(userId)}));}
export async function POST(request:Request){return worldRequest(request,true,async userId=>decideWorldInvitation(userId,await request.json()));}

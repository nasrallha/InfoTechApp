// وسيط الطباعة: أنا شغال + طابعات ويندوز اللي على الجهاز
import { NextResponse } from "next/server";
import { readJson, withAgent } from "@/lib/print-agent-api";
import { agentHeartbeat } from "@/services/print-agent.service";

export async function POST(request) {
  const body = await readJson(request);
  return withAgent(request, async (agent) =>
    NextResponse.json(await agentHeartbeat(agent, body)),
  );
}

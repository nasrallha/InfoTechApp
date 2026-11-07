// وسيط الطباعة: المهام الجاية (بيستنى لحد 25 ثانية لو مفيش)
import { NextResponse } from "next/server";
import { withAgent } from "@/lib/print-agent-api";
import { takeJobs } from "@/services/print-agent.service";

export async function GET(request) {
  const wait = Number(new URL(request.url).searchParams.get("wait") ?? 25000);
  return withAgent(request, async (agent) =>
    NextResponse.json({ jobs: await takeJobs(agent, wait) }),
  );
}

// وسيط الطباعة: نتيجة مهمة (تمت / فشلت + السبب + نتيجة البحث / الاختبار)
import { NextResponse } from "next/server";
import { readJson, withAgent } from "@/lib/print-agent-api";
import { jobResult } from "@/services/print-agent.service";

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await readJson(request);
  return withAgent(request, async (agent) =>
    NextResponse.json(await jobResult(agent, Number(id), body)),
  );
}

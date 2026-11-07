// وسيط الطباعة: الربط بكود الفرع ← مفتاح سري للجهاز
import { NextResponse } from "next/server";
import { inCompany, readJson } from "@/lib/print-agent-api";
import { pairAgent } from "@/services/print-agent.service";

export async function POST(request) {
  const body = await readJson(request);
  return inCompany(request, async () =>
    NextResponse.json(await pairAgent(body)),
  );
}

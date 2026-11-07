import "server-only";
import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { multiTenant, resolveCompany, runWithCompany } from "@/lib/tenant";
import { authAgent } from "@/services/print-agent.service";

// ============================================================
// واجهة وسيط الطباعة (API): الشركة من الهيدر x-company (وضع الشركات)
// والجهاز من المفتاح السري (Authorization: Bearer <token>)
// الأخطاء بترجع JSON: { error: "CODE" }
// ============================================================
export async function inCompany(request, fn) {
  try {
    if (multiTenant()) {
      const code = request.headers.get("x-company");
      const company = code ? await resolveCompany(code) : null;
      if (!company?.provisioned)
        return NextResponse.json({ error: "CompanyNotFound" }, { status: 404 });
      return await runWithCompany(code, fn);
    }
    return await fn();
  } catch (e) {
    if (e instanceof AppError) {
      const status = e.code === "Unauthorized" ? 401 : 400;
      return NextResponse.json({ error: e.code }, { status });
    }
    console.error("[print-agent]", e);
    return NextResponse.json({ error: "ServerError" }, { status: 500 });
  }
}

export function withAgent(request, fn) {
  return inCompany(request, async () => {
    const token = (request.headers.get("authorization") ?? "").replace(
      /^Bearer\s+/i,
      "",
    );
    const agent = await authAgent(token);
    return fn(agent);
  });
}

export const readJson = async (request) => {
  try {
    return await request.json();
  } catch {
    return {};
  }
};

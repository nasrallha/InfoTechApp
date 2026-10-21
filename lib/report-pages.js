import "server-only";
import { isDay, today } from "@/lib/dates";
import { parseId } from "@/lib/purchase-pages";

// ============================================================
// فلاتر التقارير من الرابط
// ?from=2026-07-01&to=2026-09-30  أو  ?year=2026  أو  ?year=2026&qtr=3 (الربع)
// &branch= &user= &customer= &supplier= &method= &source=pos|invoice &q=رقم
// defaultRange: "today" (الافتراضي) أو "month" (من أول الشهر)
// ============================================================

// الربع: Q1 يناير-مارس، Q2 أبريل-يونيو، Q3 يوليو-سبتمبر، Q4 أكتوبر-ديسمبر
export function quarterRange(value) {
  const m = String(value ?? "").match(/^(\d{4})-Q([1-4])$/);
  if (!m) return null;
  const year = Number(m[1]);
  const q = Number(m[2]);
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  const pad = (x) => String(x).padStart(2, "0");
  return {
    from: `${year}-${pad(startMonth)}-01`,
    to: `${year}-${pad(endMonth)}-${pad(lastDay)}`,
  };
}

// الربع الحالي: { year: 2026, qtr: 4 }
export function currentQuarter() {
  const d = today();
  return {
    year: Number(d.slice(0, 4)),
    qtr: Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1,
  };
}

export function parseReportFilters(sp = {}, { defaultRange = "today" } = {}) {
  const now = today();
  let from = isDay(sp.from) ? sp.from : null;
  let to = isDay(sp.to) ? sp.to : null;

  // السنة لوحدها (السنة كاملة) أو السنة + الربع (?year=2026&qtr=3)
  // (?quarter=2026-Q3 يفضل شغال للروابط القديمة)
  let year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : null;
  let qtr = ["1", "2", "3", "4"].includes(String(sp.qtr))
    ? Number(sp.qtr)
    : null;
  const legacy = String(sp.quarter ?? "").match(/^(\d{4})-Q([1-4])$/);
  if (legacy) {
    year = Number(legacy[1]);
    qtr = Number(legacy[2]);
  }
  if (year && (year < 2000 || year > 2100)) year = null;
  if (!year) qtr = null;
  if (year) {
    if (qtr) ({ from, to } = quarterRange(`${year}-Q${qtr}`));
    else {
      from = `${year}-01-01`;
      to = `${year}-12-31`;
    }
  }

  if (!to) to = now;
  if (!from) from = defaultRange === "today" ? to : `${to.slice(0, 7)}-01`;
  if (from > to) [from, to] = [to, from];
  const source = ["pos", "invoice"].includes(sp.source) ? sp.source : null;
  return {
    from,
    to,
    year,
    qtr,
    branchId: parseId(sp.branch),
    userId: parseId(sp.user),
    customerId: parseId(sp.customer),
    supplierId: parseId(sp.supplier),
    paymentMethodId: parseId(sp.method),
    source,
    q: sp.q ? String(sp.q).slice(0, 30) : null,
  };
}

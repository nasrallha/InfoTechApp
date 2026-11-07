import "server-only";
import { prisma } from "@/lib/prisma";
import { hasModule } from "@/lib/modules";

// ============================================================
// المقاسات (وحدة variants) في قوايم اختيار الأصناف (البيع والشراء)
// الموديل بيظهر مرة واحدة باسمه و sizePick = رقمه ← الشاشة بتفتح شبكة المقاسات
// الباركود المطابق بالظبط (exactUnitId) بيفضل المقاس نفسه
// ============================================================

export const variantsEnabled = () => hasModule("variants");

// صف الموديل: اسم الموديل بدل اسم المقاس
export const asModel = (row, model) => ({
  ...row,
  arName: model?.arName ?? row.arName,
  enName: model?.enName ?? row.enName,
  sizePick: row.modelId,
});

// raw: صفوف قاعدة البيانات (فيها model)، rows: نفس الصفوف بعد التحويل
export function collapseModels(raw, rows) {
  const seen = new Set();
  const out = [];
  rows.forEach((p, i) => {
    if (!p.modelId || p.exactUnitId) return out.push(p);
    if (seen.has(p.modelId)) return;
    seen.add(p.modelId);
    out.push(asModel(p, raw[i].model));
  });
  return out;
}

// شرط التصفح بالصفحات: الموديل مرة واحدة (أول مقاس نشط منه)
export async function modelHeadsWhere() {
  const rows = await prisma.product.groupBy({
    by: ["modelId"],
    where: { isActive: true, modelId: { not: null } },
    _min: { id: true },
  });
  return {
    OR: [{ modelId: null }, { id: { in: rows.map((r) => r._min.id) } }],
  };
}

// حقول الموديل في select قوايم الاختيار
export const modelFields = {
  modelId: true,
  size: true,
  color: true,
  colorHex: true,
  model: { select: { arName: true, enName: true } },
};

// ألوان كل موديل (دواير صغيرة على كارت الصنف في الكاشير)
export async function withModelColors(rows) {
  const ids = [
    ...new Set(rows.filter((r) => r.sizePick).map((r) => r.sizePick)),
  ];
  if (!ids.length) return rows;
  const found = await prisma.product.findMany({
    where: { modelId: { in: ids }, isActive: true, color: { not: null } },
    distinct: ["modelId", "color"],
    orderBy: { id: "asc" },
    select: { modelId: true, color: true, colorHex: true },
  });
  const byModel = new Map();
  for (const f of found) {
    const list = byModel.get(f.modelId) ?? [];
    list.push({ name: f.color, hex: f.colorHex });
    byModel.set(f.modelId, list);
  }
  return rows.map((r) =>
    r.sizePick ? { ...r, modelColors: byModel.get(r.sizePick) ?? [] } : r,
  );
}

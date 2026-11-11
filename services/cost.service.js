import "server-only";

// ============================================================
// تكلفة الصنف = المتوسط المرجّح المتحرك (بدل آخر سعر شراء) - قبل الضريبة دايماً
// - مع كل شراء: المتوسط = (الرصيد × المتوسط + الكمية المشتراة × سعرها) ÷ (الرصيد + الكمية)
//   (سعرها = صافي السطر بعد الخصم ومن غير الضريبة ÷ الكمية بالوحدة الأساسية)
// - مرتجع الشراء: بيخرج بسعر شرائه، والمتوسط بيتعدل على الباقي
// - الرصيد صفر أو سالب وقت الشراء: المتوسط = سعر الشراء ده
// - الرصيد الافتتاحي: بتكلفته (لو صفر = غير معروفة ومش بتدخل في المتوسط)
// - البيع والمرتجع والتالف والجرد والتحويل: بيغيّروا الكمية بس بالمتوسط وقتها
//   (المتوسط على مستوى الشركة: التحويل بين المستودعات مبيغيّرش التكلفة)
// - المصدر: حركات المخزون (فيها الكمية والتكلفة والتاريخ لكل دخول وخروج)
//   فمفيش جدول زيادة، وإعادة الحساب بتعيد تشغيل حركات الصنف بالترتيب
// - from: لو فاتورة شراء اتعدلت/اتحذفت/اتسجلت بتاريخ قديم ← فواتير البيع والمرتجع
//   من التاريخ ده ورايح تكلفتها بتتصحح بالمتوسط الصح وقتها (الأرباح تفضل مظبوطة)
// ============================================================

const n = (v) => (v == null ? 0 : Number(v));
const EPS = 1e-6;
const round4 = (v) => Math.round((Number(v) + Number.EPSILON) * 1e4) / 1e4;

// الحركات اللي بتغيّر المتوسط (الباقي بيغيّر الكمية بس)
const PURCHASE_IN = "purchase";
const PURCHASE_OUT = "purchase_return";
const OPENING = "opening";
// حركات البيع اللي تكلفتها بتتصحح
const SALE_TYPES = new Set(["sale", "sale_return"]);

// productIds: الأصناف اللي اتأثرت | from: أقدم تاريخ اتغير (Date) أو null = الحالي بس
export async function recomputeAvgCost(tx, productIds, from = null) {
  for (const productId of new Set(productIds)) {
    if (!productId) continue;
    const moves = await tx.stockMovement.findMany({
      where: { productId },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: { id: true, qty: true, cost: true, type: true, refId: true, date: true },
    });
    let qty = 0;
    let avg = null; // null = لسه مفيش تكلفة معروفة
    const fixes = [];
    for (const m of moves) {
      const q = n(m.qty);
      const c = n(m.cost);
      if (m.type === PURCHASE_IN && q > 0) {
        avg = qty > EPS && avg != null ? (qty * avg + q * c) / (qty + q) : c;
      } else if (m.type === PURCHASE_OUT && q < 0) {
        const left = qty + q;
        if (left > EPS && avg != null) avg = (qty * avg + q * c) / left;
      } else if (m.type === OPENING && q > 0 && c > 0) {
        avg = qty > EPS && avg != null ? (qty * avg + q * c) / (qty + q) : c;
      } else if (
        SALE_TYPES.has(m.type) &&
        avg != null &&
        from &&
        m.date >= from &&
        Math.abs(c - avg) > 1e-4
      ) {
        fixes.push({ move: m, cost: round4(avg) });
      }
      qty += q;
    }
    if (avg == null) continue; // مفيش مشتريات: التكلفة زي ما هي

    // التكلفة الحالية للصنف (والوحدات الإضافية = المتوسط × معاملها)
    const cost = round4(avg);
    await tx.product.update({ where: { id: productId }, data: { cost } });
    const units = await tx.productUnit.findMany({
      where: { productId },
      select: { id: true, conversionFactor: true },
    });
    for (const u of units)
      await tx.productUnit.update({
        where: { id: u.id },
        data: { cost: round4(cost * n(u.conversionFactor)) },
      });

    // تصحيح تكلفة فواتير البيع والمرتجع بعد التاريخ (حركة المخزون + سطور الفاتورة + إجماليها)
    const saleIds = new Set();
    for (const f of fixes) {
      await tx.stockMovement.update({
        where: { id: f.move.id },
        data: { cost: f.cost },
      });
      const lines = await tx.saleItem.findMany({
        where: { saleId: f.move.refId, productId },
        select: { id: true, baseQty: true },
      });
      for (const l of lines)
        await tx.saleItem.update({
          where: { id: l.id },
          data: { cost: f.cost, costAmount: round4(n(l.baseQty) * f.cost) },
        });
      saleIds.add(f.move.refId);
    }
    for (const saleId of saleIds) {
      const sum = await tx.saleItem.aggregate({
        where: { saleId },
        _sum: { costAmount: true },
      });
      await tx.sale.update({
        where: { id: saleId },
        data: { costAmount: round4(n(sum._sum.costAmount)) },
      });
    }
  }
}

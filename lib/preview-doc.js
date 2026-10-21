// ============================================================
// معاينة الفاتورة قبل الحفظ: بنبني "مستند" بنفس شكل المستند المحفوظ
// (اللي بتستخدمه SaleDocument / PurchaseDocument / InvoiceA4)
// من البيانات اللي على الشاشة، من غير ما نحفظ حاجة
// ============================================================

// وحدة السطر (من قايمة وحدات الصنف أو من السطر نفسه)
function unitOf(l) {
  if (l.unit?.arName) return l.unit;
  const u = l.units?.find((x) => x.unit.id === l.unitId);
  return u?.unit ?? null;
}

// سطور الحساب (calcInvoice) ← سطور المستند
export function previewItems(lines) {
  return lines.map((l, i) => ({
    id: l.key ?? i,
    productId: l.productId,
    code: l.code,
    arName: l.arName,
    enName: l.enName,
    note: l.note?.trim() || null,
    unit: unitOf(l),
    qty: Number(l.qty) || 0,
    price: Number(l.price) || 0,
    priceIncludesTax: l.taxMode === "inclusive",
    itemDiscount: l.itemDiscount ?? 0,
    invoiceDiscount: l.invoiceDiscount ?? 0,
    taxRate: l.taxRate ?? 0,
    netAmount: l.net ?? 0,
    taxAmount: l.tax ?? 0,
    totalAmount: l.total ?? 0,
  }));
}

// المدفوعات على الشاشة ← مدفوعات المستند (+ المتبقي آجل)
export function previewPayments(payments, methods, total) {
  const rows = (payments ?? [])
    .filter((p) => Number(p.amount) > 0)
    .map((p, i) => ({
      id: p.key ?? i,
      paymentMethodId: p.paymentMethodId,
      paymentMethod: methods.find((m) => m.id === p.paymentMethodId) ?? {
        arName: "",
        enName: "",
      },
      amount: Number(p.amount) || 0,
    }));
  const paid = rows.reduce((s, p) => s + p.amount, 0);
  return {
    payments: rows,
    paidAmount: paid,
    remainingAmount: Math.max(0, Math.round((total - paid) * 100) / 100),
  };
}

// الإجماليات (totalsOf) ← حقول المستند
export function previewTotals(totals) {
  return {
    subtotal: totals.subtotal ?? 0,
    itemsDiscount: totals.itemsDiscount ?? 0,
    invoiceDiscount: totals.invoiceDiscount ?? 0,
    netAmount: totals.net ?? 0,
    taxAmount: totals.tax ?? 0,
    totalAmount: totals.total ?? 0,
  };
}

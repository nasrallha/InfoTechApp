// ============================================================
// سبب الخطأ غير المتوقع للمستخدم (بدل «حدث خطأ غير متوقع» وبس)
// ← { kind, field, text }
//   kind  = نوع معروف (له رسالة مترجمة: ErrorReason_<kind>) أو null
//   field = اسم العمود / الحقل لو معروف
//   text  = النص التقني المختصر (للأنواع غير المعروفة)
// ============================================================

// كل النصوص التقنية للخطأ (رسالة Prisma + سبب الـ driver)
function rawText(error) {
  const driver = error?.meta?.driverAdapterError;
  const parts = [
    driver?.cause?.message,
    driver?.cause?.originalMessage,
    error?.meta?.message,
    error?.message,
  ];
  return parts.filter((x) => typeof x === "string" && x.trim()).join(" | ");
}

// آخر سطر مفيد من الرسالة (رسايل Prisma بتبدأ بـ «Invalid `prisma.x()` invocation»)
function shortText(error) {
  const lines = String(error?.message ?? error ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^Invalid `|invocation:?$/.test(l));
  return (lines.slice(-2).join(" | ") || "Error").slice(0, 300);
}

export function errorReason(error) {
  const code = error?.code;
  const text = rawText(error);
  const pick = (re) => text.match(re)?.[1] ?? null;

  // قيمة أطول من المسموح في العمود
  if (/Data too long|\b1406\b/i.test(text) || code === "P2000")
    return { kind: "TooLong", field: pick(/for column '([^']+)'/i) ?? error?.meta?.column_name ?? null };

  // رقم أكبر من المسموح
  if (/Out of range value|\b1264\b/i.test(text) || code === "P2020")
    return { kind: "OutOfRange", field: pick(/for column '([^']+)'/i) };

  // قيمة مكررة (فهرس فريد)
  if (code === "P2002" || /Duplicate entry/i.test(text)) {
    const target = error?.meta?.target;
    return {
      kind: "Duplicate",
      field: Array.isArray(target) ? target.join(", ") : (target ?? pick(/for key '([^']+)'/i)),
    };
  }

  // السجل مرتبط بمستندات تانية (ما ينفعش يتمسح / المرتبط بيه مش موجود)
  if (code === "P2003" || /foreign key constraint/i.test(text))
    return { kind: "InUse", field: error?.meta?.field_name ?? null };

  // السجل اتمسح أو مش موجود
  if (code === "P2025") return { kind: "RecordMissing", field: null };

  // حقل إجباري فاضي
  if (code === "P2011" || /cannot be null|\b1048\b/i.test(text))
    return { kind: "MissingValue", field: error?.meta?.constraint ?? pick(/Column '([^']+)'/i) };

  // العملية طولت (الحفظ اتلغى)
  if (code === "P2028" || /Transaction (already closed|API error)|timeout/i.test(text))
    return { kind: "Timeout", field: null };

  // جهاز تاني بيعدل نفس البيانات في نفس اللحظة
  if (code === "P2034" || /Deadlock|Lock wait timeout/i.test(text))
    return { kind: "Busy", field: null };

  return { kind: null, field: null, text: shortText(error) };
}

// رقم مرجعي قصير للخطأ (بيظهر للمستخدم وبيتسجل في الـ log جنبه)
export function errorRef() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

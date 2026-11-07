"use client";

import { message } from "@/components/common/feedback";
import { listSep } from "@/lib/list-sep";

// ============================================================
// رسالة خطأ الـ action للمستخدم
// - "الرصيد لا يكفي": نعرض كل صنف والمتاح والمطلوب (بالوحدة الأساسية)
// - غير ذلك: رسالة الخطأ المترجمة فقط
// ============================================================
export function showActionError(res, tAlerts, locale) {
  const list = Array.isArray(res?.details) ? res.details : null;
  if (res?.error === "InsufficientStock" && list?.length) {
    message.error({
      duration: 8,
      content: (
        <div style={{ textAlign: "start" }}>
          <b>{tAlerts("InsufficientStock")}</b>
          <ul style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>
            {list.slice(0, 8).map((s) => (
              <li key={`${s.productId}:${s.warehouseId}`}>
                {locale === "ar" ? s.arName : s.enName} —{" "}
                {tAlerts("StockAvailableRequested", {
                  available: s.available,
                  requested: s.requested,
                })}
              </li>
            ))}
          </ul>
        </div>
      ),
    });
    return;
  }
  // أصناف السبب (زي الكمية بكسر في وحدة متقبلش كسور): أسماؤها بعد الرسالة
  if (list?.length && list[0]?.arName != null) {
    const names = list
      .slice(0, 5)
      .map((x) =>
        locale === "ar" ? x.arName || x.enName : x.enName || x.arName,
      )
      .join(listSep(locale));
    message.error(`${tAlerts(res.error ?? "UnexpectedError")}: ${names}`);
    return;
  }
  // تفاصيل زي { minutes } أو { remaining } بتتحط في نص الرسالة
  const values =
    res?.details && typeof res.details === "object" && !list
      ? res.details
      : undefined;
  message.error(tAlerts(res?.error ?? "UnexpectedError", values));
}

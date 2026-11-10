"use client";

import { message } from "@/components/common/feedback";
import { printQuery } from "@/lib/print-param";

// ============================================================
// بعد حفظ مستند جديد: الشاشة بتفضل زي ما هي (جاهزة لمستند جديد)
// - رسالة الحفظ ومعاها رابط "عرض" المستند (في تبويب جديد)
// - حفظ وطباعة: المستند بيتفتح في تبويب جديد ويتطبع هناك
//   (لو المتصفح منع التبويب: الرسالة فيها رابط "طباعة")
// path: رابط المستند من غير اللغة (/invoices/sales/15)
// mode: save | print-thermal | print-a4
// ============================================================
export function afterSave({ path, mode, locale, text, labels }) {
  const base = `/${locale}${path}`;
  const query = printQuery(mode);
  const opened = query ? Boolean(window.open(base + query, "_blank")) : true;
  message.success({
    duration: 6,
    content: (
      <span>
        {text}{" "}
        <a href={base} target="_blank" rel="noreferrer">
          {labels.view}
        </a>
        {!opened && (
          <>
            {" | "}
            <a href={base + query} target="_blank" rel="noreferrer">
              {labels.print}
            </a>
          </>
        )}
      </span>
    ),
  });
}

"use client";

import { useMemo, useRef } from "react";

// ============================================================
// بصمة الحفظ (Idempotency) في شاشات الحفظ
// - كل محاولة حفظ بتاخد requestId (UUID) يفضل ثابت لحد ما الحفظ ينجح
// - لو الرد ضاع (النت قطع) والمستخدم داس حفظ/دفع تاني: نفس البصمة
//   فالسيرفر يرجّع المستند اللي اتحفظ أول مرة بدل ما يكرره
// - بعد النجاح: بصمة جديدة للمستند اللي بعده
// ============================================================

// crypto.randomUUID مش متاح على http عادي (جهاز تاني على الشبكة المحلية)
// فبنعمل UUID v4 من getRandomValues (متاح في كل الأحوال)
export function newRequestId() {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      // نكمل بالطريقة التانية
    }
  }
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function useSaveKey() {
  const ref = useRef(null);
  return useMemo(
    () => ({
      // يبعت الحفظ بالبصمة، ولو الاتصال وقع يرجّع خطأ بدل ما الشاشة تعلّق
      async send(action, payload) {
        ref.current ??= newRequestId();
        try {
          const res = await action({ ...payload, requestId: ref.current });
          if (res?.success) ref.current = null;
          return res;
        } catch {
          return { success: false, error: "ConnectionLost" };
        }
      },
      // مستند جديد (تفريغ الشاشة): بصمة جديدة
      reset() {
        ref.current = null;
      },
    }),
    [],
  );
}

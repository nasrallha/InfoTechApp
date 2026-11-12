"use client";

import { useSyncExternalStore } from "react";

// ============================================================
// محتوى بيترسم في المتصفح بس (بعد التحميل)
// - نوافذ Modal اللي فيها forceRender: السيرفر مش بيرسم البورتال والمتصفح بيرسمه
//   فوراً ← خطأ hydration، فبنأجلها لحد ما الصفحة تتحمّل
// ============================================================
const subscribe = () => () => {};

export function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export default function ClientOnly({ children }) {
  return useMounted() ? children : null;
}

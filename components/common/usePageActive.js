"use client";

import { useEffect, useState } from "react";

// ============================================================
// الصفحة ظاهرة فعلاً؟
// Next (cacheComponents) بيسيب الصفحة اللي سبتها شغالة في الخلفية (Activity)
// والنافذة المفتوحة جواها بتفضل مربوطة بمراجع (refs) اتفصلت، فلما الصفحة
// ترجع تظهر antd بيحاول يعمل focus ويقع (contentRef.current?.focus is not a function)
// الحل: النوافذ المفروضة (زي فتح الوردية) متترسمش غير والصفحة ظاهرة،
// فبتتعمل من جديد كل مرة الصفحة تظهر
// ============================================================
export function usePageActive() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setActive(true));
    return () => {
      cancelAnimationFrame(id);
      setActive(false);
    };
  }, []);
  return active;
}

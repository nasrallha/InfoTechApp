// ============================================================
// التغيير الدوري للسيارة (زيت، فلتر...) - حساب مشترك (السيرفر والشاشة)
// الغيار القادم = العداد + كل كام كم، و/أو يوم الفاتورة + كل كام شهر
// day: "YYYY-MM-DD" ← nextDay: "YYYY-MM-DD" (نفس اليوم بعد كام شهر،
// ولو الشهر أقصر: آخر يوم فيه)
// ============================================================
export function computeNextChange({ km, months, odometer, day }) {
  km = Number(km) || 0;
  months = Number(months) || 0;
  let nextDay = null;
  if (months && day) {
    const [y, m, dd] = day.split("-").map(Number);
    const target = new Date(Date.UTC(y, m - 1 + months, 1));
    const last = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
    ).getUTCDate();
    target.setUTCDate(Math.min(dd, last));
    nextDay = target.toISOString().slice(0, 10);
  }
  return {
    nextKm:
      km && odometer != null && odometer !== "" ? Number(odometer) + km : null,
    nextDay,
  };
}

export const hasChangeInterval = (x) =>
  Number(x?.changeKm) > 0 || Number(x?.changeMonths) > 0;

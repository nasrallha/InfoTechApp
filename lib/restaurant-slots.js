// ============================================================
// مواعيد الوصول للطلب الأونلاين (توقيت السعودية +03:00)
// - الاستقبال من open لحد close (لو close <= open يبقى بعد نص الليل: 10:00 → 02:00)
// - أقرب ميعاد = دلوقتي + وقت التحضير، مقرّب لفوق على فترة المواعيد
// - بيرجع مواعيد النهارده بس (والفترة اللي بدأت امبارح وماخلصتش)
// ============================================================
const OFFSET = "+03:00";
const DAY = 24 * 3600 * 1000;

const ksaDay = (d) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
const at = (day, time) => new Date(`${day}T${time}:00${OFFSET}`);
const hhmm = (d) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);

export function onlineSlots(
  { open = "10:00", close = "23:00", prepMin = 20, slotMin = 15 },
  now = new Date(),
  max = 64,
) {
  const step = Math.max(5, Number(slotMin) || 15) * 60_000;
  const earliest = now.getTime() + Math.max(0, Number(prepMin) || 0) * 60_000;
  const out = [];
  // فترة امبارح (لو بتعدّي نص الليل) + فترة النهارده
  for (const offset of [-1, 0]) {
    const day = ksaDay(new Date(now.getTime() + offset * DAY));
    const start = at(day, open).getTime();
    let end = at(day, close).getTime();
    if (end <= start) end += DAY;
    let t = Math.max(start, Math.ceil(earliest / step) * step);
    for (; t <= end && out.length < max; t += step) {
      if (!out.some((s) => s.at === new Date(t).toISOString()))
        out.push({ at: new Date(t).toISOString(), time: hhmm(new Date(t)) });
    }
  }
  return out;
}

// الميعاد اللي العميل اختاره لسه متاح؟ (بنقبل فرق دقيقة)
export function isValidSlot(settings, iso, now = new Date()) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return onlineSlots(settings, now, 500).some(
    (s) => Math.abs(new Date(s.at).getTime() - t) < 60_000,
  );
}

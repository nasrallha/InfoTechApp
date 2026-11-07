"use client";

import { warrantyEndDay } from "@/lib/warranty";
import { formatDateTime } from "@/lib/dates";
import { useModuleSettings } from "@/components/auth/AuthProvider";

// اسم مقدم الخدمة في الطباعة حسب النشاط (عربي / إنجليزي)
const STAFF_LABEL = {
  technician: ["الفني", "Technician"],
  staff: ["العاملة", "Staff"],
  barber: ["الحلاق", "Barber"],
  therapist: ["المعالج", "Therapist"],
};

// ============================================================
// الأرقام التسلسلية والضمان تحت الصنف (الطباعة وتفاصيل الفاتورة)
// line.serials: [{ serialText, serial2Text, serial: { isUsed } }]
// L(ar, en): نص الطباعة باللغة/اللغتين حسب إعدادات الفاتورة
// date: تاريخ الفاتورة (لحساب نهاية الضمان)
// showWarranty: false في المرتجع (من غير الضمان والموعد)
// line.technician / jobAt / jobAddress: مقدم الخدمة (الفني / العاملة ...) والموعد
// ============================================================
export default function SerialPrintLines({
  line,
  date,
  L,
  className,
  showWarranty = true,
}) {
  const { staffTitle = "technician" } = useModuleSettings();
  const staffLabel = STAFF_LABEL[staffTitle] ?? STAFF_LABEL.technician;
  const serials = line.serials ?? [];
  // المرتجع: الأرقام بس من غير الضمان
  const months = showWarranty ? (line.warrantyMonths ?? 0) : 0;
  // الفني والموعد لسطر الخدمة (وحدة technicians)
  const tech = line.technician;
  const hasJob = Boolean(tech || line.jobAt) && showWarranty;
  if (!serials.length && !(months > 0) && !hasJob) return null;
  const end = warrantyEndDay(date, months);
  const used = serials.some((s) => s.serial?.isUsed);
  return (
    // أسود وبخط عادي (مش رمادي ولا صغير) عشان مايبهتش على طابعة الكاشير
    <div
      className={className}
      style={{ fontSize: "1em", color: "#000", fontWeight: 600 }}
    >
      {serials.length > 0 && (
        <div>
          {L("الرقم التسلسلي", "S/N")}:{" "}
          <bdi>
            {serials
              .map((s) =>
                s.serial2Text
                  ? `${s.serialText} / ${s.serial2Text}`
                  : s.serialText,
              )
              .join("، ")}
          </bdi>
          {used ? ` (${L("مستعمل", "Used")})` : ""}
        </div>
      )}
      {months > 0 && (
        <div>
          {L("الضمان", "Warranty")}: {months} {L("شهرًا", "months")}
          {line.warrantyType === "agent"
            ? ` — ${L("الوكيل", "Agent")}`
            : line.warrantyType === "store"
              ? ` — ${L("المحل", "Store")}`
              : ""}
          {end && (
            <>
              {" "}
              {L("حتى", "until")} <bdi>{end}</bdi>
            </>
          )}
        </div>
      )}
      {hasJob && (
        <div>
          {tech && (
            <>
              {L(...staffLabel)}: {L(tech.arName, tech.enName)}
            </>
          )}
          {line.jobAt && (
            <>
              {tech ? " — " : ""}
              {L("الموعد", "Appointment")}:{" "}
              <bdi>{formatDateTime(line.jobAt)}</bdi>
            </>
          )}
          {line.jobAddress && <div>{line.jobAddress}</div>}
        </div>
      )}
    </div>
  );
}

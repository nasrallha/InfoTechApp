"use client";

import { useState } from "react";
import { Button, Space } from "antd";
import { FilePdfOutlined, PrinterOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { showActionError } from "@/components/common/actionError";
import { getTailorOrderAction } from "@/actions/tailoring.actions";
import TailorOrderCard from "./TailorOrderCard";

// ============================================================
// كارت الطلب للخياط: طباعة + PDF (نفس شكل الكارت المرسوم بالظبط)
// order: الطلب جاهز (شاشة الطلب) - أو orderId: بيتجاب وقت الضغط (القايمة / بعد الحفظ)
// fields / groups: خانات المقاسات ورسومات التفاصيل الحالية
// iconOnly: أزرار صغيرة من غير كلام
// compact: «طباعة الكارت» بكلام + PDF أيقونة بس (جدول الطلبات)
// ============================================================
export default function CardActions({
  order,
  orderId,
  fields,
  groups,
  size = "middle",
  iconOnly = false,
  compact = false,
}) {
  const t = useTranslations("Tailoring");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const [job, setJob] = useState(null); // { order, pdf }
  const [busy, setBusy] = useState(null);

  const run = async (pdf) => {
    let o = order;
    if (!o) {
      setBusy(pdf ? "pdf" : "print");
      const res = await getTailorOrderAction(orderId);
      setBusy(null);
      if (!res.success) return showActionError(res, tAlerts, locale);
      o = res.data;
    }
    setJob({ order: o, pdf, seq: Date.now() });
  };

  return (
    <>
      <Space size={4} wrap>
        <Button
          size={size}
          icon={<PrinterOutlined />}
          loading={busy === "print"}
          title={t("PrintCard")}
          onClick={() => run(false)}
        >
          {iconOnly ? null : t("PrintCard")}
        </Button>
        <Button
          size={size}
          icon={<FilePdfOutlined />}
          loading={busy === "pdf"}
          title={t("CardPdf")}
          onClick={() => run(true)}
        >
          {iconOnly || compact ? null : t("CardPdf")}
        </Button>
      </Space>
      {job && (
        <TailorOrderCard
          key={job.seq}
          order={job.order}
          fields={fields}
          groups={groups}
          pdf={job.pdf}
          onDone={() => setJob(null)}
        />
      )}
    </>
  );
}

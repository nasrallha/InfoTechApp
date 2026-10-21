"use client";

import { useCallback, useEffect, useState } from "react";
import { Tag, Tooltip } from "antd";
import { NumberOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { formatDocNo } from "@/lib/doc-number";
import { getNextDocNumberAction } from "@/actions/sequence.actions";

// نوع المستند ← بادئة الرقم (PI / PR / SI / SR / QT)
const PREFIX_TYPE = {
  purchase: "purchase",
  purchaseReturn: "return",
  sale: "sale",
  saleReturn: "saleReturn",
  quotation: "quotation",
  receipt: "receipt",
  payment: "payment",
  settlement: "settlement",
};

// ============================================================
// رقم المستند اللي عليه الدور (في شاشة الإضافة)
// - يتحدث كل 15 ثانية وعند الرجوع للشاشة: لو مستخدم تاني حفظ قبلك
//   الرقم يزيد تلقائياً
// - الرقم النهائي يتحدد لحظة الحفظ (بدون تكرار مهما كان عدد المستخدمين)
// refreshKey: غيّره بعد الحفظ (الكاشير) ليتحدث فوراً
// ============================================================
export default function NextDocNo({ type, refreshKey, size = "large", dark }) {
  const [number, setNumber] = useState(null);
  const t = useTranslations("Invoices");

  const load = useCallback(async () => {
    const res = await getNextDocNumberAction(type);
    if (res.success) setNumber(res.data);
  }, [type]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load, refreshKey]);

  if (number == null) return null;
  return (
    <Tooltip title={t("NextNumberHint")}>
      <Tag
        icon={<NumberOutlined />}
        color={dark ? "gold" : "blue"}
        style={{
          fontSize: size === "large" ? 15 : 13,
          padding: size === "large" ? "4px 10px" : undefined,
          fontWeight: 700,
          marginInlineEnd: 0,
        }}
      >
        {t("NextNumber")}: <bdi>{formatDocNo(PREFIX_TYPE[type], number)}</bdi>
      </Tag>
    </Tooltip>
  );
}

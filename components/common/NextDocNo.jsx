"use client";

import { useCallback, useEffect, useState } from "react";
import { Space, Tag, Tooltip } from "antd";
import { NumberOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { formatDocNo } from "@/lib/doc-number";
import { getNextDocNumberAction } from "@/actions/sequence.actions";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import DocBranchSelect from "./DocBranchSelect";

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
  offset: "offset",
  saleCredit: "saleCredit",
  saleDebit: "saleDebit",
  purchaseCredit: "purchaseCredit",
  purchaseDebit: "purchaseDebit",
};

// ============================================================
// رقم المستند اللي عليه الدور (في شاشة الإضافة) + اختيار فرع المستند
// - يتحدث كل 15 ثانية وعند الرجوع للشاشة: لو مستخدم تاني حفظ قبلك
//   الرقم يزيد تلقائياً
// - الرقم النهائي يتحدد لحظة الحفظ (بدون تكرار مهما كان عدد المستخدمين)
// - مدير النظام: اختيار الفرع جنب الرقم (DocBranchSelect)، والرقم بيتحدث على الفرع
// refreshKey: غيّره بعد الحفظ (الكاشير) ليتحدث فوراً
// branch: يظهر اختيار الفرع (الكاشير: لأ - مربوط بالوردية والدرج)
// ============================================================
export default function NextDocNo({
  type,
  refreshKey,
  size = "large",
  dark,
  branch = true,
}) {
  // { number, code }: الرقم المتوقع + رمز الفرع
  const [next, setNext] = useState(null);
  const t = useTranslations("Invoices");
  // الفرع الحالي: لما يتغير الرقم المتوقع يتحدث (رمزه ومسلسله)
  const branchId = useCurrentUser()?.branch?.id;

  const load = useCallback(async () => {
    const res = await getNextDocNumberAction(type);
    if (res.success) setNext(res.data);
  }, [type]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load, refreshKey, branchId]);

  const tag =
    next == null ? null : (
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
          {t("NextNumber")}:{" "}
          <bdi>{formatDocNo(PREFIX_TYPE[type], next.number, next.code)}</bdi>
        </Tag>
      </Tooltip>
    );
  if (!branch) return tag;
  return (
    <Space size={6} wrap>
      <DocBranchSelect size={size === "large" ? "middle" : "small"} />
      {tag}
    </Space>
  );
}

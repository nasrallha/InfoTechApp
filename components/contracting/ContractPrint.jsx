"use client";

import { useTranslations } from "next-intl";
import A4Frame from "@/components/printing/A4Frame";
import { ContractingHead } from "./CertificatePrint";
import "./contracting-print.css";

// ============================================================
// طباعة العقد (A4): النص المحفوظ بس
// (من غير جدول كميات: البنود بتتكتب في المستخلصات، وقيمة العقد ونسبه في نص العقد)
// ============================================================
export default function ContractPrint({ contract: c }) {
  const t = useTranslations("Contracting");
  return (
    <A4Frame>
      <div className="ctp" dir="rtl">
        <ContractingHead title={`${t("Contract")} ${c.docNo}`} sub={c.projectName} />
        {c.content && <div className="ctp__text">{c.content}</div>}
      </div>
    </A4Frame>
  );
}

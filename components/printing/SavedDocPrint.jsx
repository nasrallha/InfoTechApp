"use client";

import { useEffect, useState } from "react";
import { Alert, Spin } from "antd";
import { useTranslations } from "next-intl";
import { getSavedDocForPrintAction } from "@/actions/invoice-print.actions";
import { purchaseDocNo, saleDocNo, formatDocNo } from "@/lib/doc-number";
import { SAVE_PRINT_A4, SAVE_PRINT_THERMAL } from "@/lib/print-param";
import PrintActions from "./PrintActions";
import InvoiceA4 from "./invoice/InvoiceA4";
import SaleDocument from "@/components/sales/SaleDocument";
import PurchaseDocument from "@/components/purchases/PurchaseDocument";

// ============================================================
// بعد حفظ مستند جديد: الشاشة بتفضل زي ما هي (من غير انتقال ولا تبويب جديد)
// - شريط "تم الحفظ" فوق الشاشة ومعاه أزرار الطباعة / PDF
// - حفظ وطباعة: بيتطبع على طول من نفس الشاشة
// job: { kind, id, mode, text, seq, paper? } (seq: رقم فريد لكل حفظ، paper: ورق محدد)
// kind: sale | return | quotation | purchase | purchaseReturn | saleNote | purchaseNote
// ============================================================
export default function SavedDocPrint({ job, onClose }) {
  if (!job) return null;
  return <SavedJob key={job.seq} job={job} onClose={onClose} />;
}

const PURCHASE_KINDS = ["purchase", "purchaseReturn", "purchaseNote"];

function SavedJob({ job, onClose }) {
  const [data, setData] = useState(null);
  const tAlerts = useTranslations("Alerts");

  useEffect(() => {
    let alive = true;
    getSavedDocForPrintAction({ kind: job.kind, id: job.id }).then((res) => {
      if (alive) setData(res.success ? res.data : { error: res.error });
    });
    return () => {
      alive = false;
    };
  }, [job.kind, job.id]);

  const isPurchase = PURCHASE_KINDS.includes(job.kind);
  const doc = data?.doc;
  // نوع الطباعة حسب المستند
  const printKind =
    job.kind === "saleNote"
      ? doc?.type
      : job.kind === "purchaseNote"
        ? doc?.type === "credit"
          ? "purchaseCredit"
          : "purchaseDebit"
        : job.kind;
  const docNo = !doc
    ? ""
    : job.kind === "quotation"
      ? formatDocNo("quotation", doc.number, doc.docCode)
      : isPurchase
        ? purchaseDocNo(doc.type, doc.number, doc.docCode)
        : saleDocNo(doc.type, doc.number, doc.docCode);

  // الضريبية قبل اعتماد الهيئة: متطبعش تلقائياً (زي صفحة الفاتورة)
  const zdoc = doc?.zatcaDocument;
  const notCleared = zdoc?.kind === "standard" && zdoc.status !== "cleared";
  const autoPrint = notCleared
    ? false
    : job.mode === SAVE_PRINT_THERMAL
      ? "thermal"
      : job.mode === SAVE_PRINT_A4
        ? "A4"
        : false;

  const renderDoc = (paper) => {
    const settings = { ...data.settings, paperSize: paper };
    if (paper === "A4")
      return (
        <InvoiceA4
          kind={printKind}
          doc={doc}
          company={data.company}
          settings={data.settings}
        />
      );
    return isPurchase ? (
      <PurchaseDocument
        settings={settings}
        company={data.company}
        purchase={doc}
      />
    ) : (
      <SaleDocument
        settings={settings}
        company={data.company}
        doc={doc}
        kind={printKind}
      />
    );
  };

  return (
    <Alert
      className="mb-3"
      type="success"
      showIcon
      closable
      onClose={onClose}
      title={job.text}
      action={
        !data ? (
          <Spin size="small" />
        ) : data.error ? (
          <span>{tAlerts(data.error)}</span>
        ) : (
          <PrintActions
            autoPrint={autoPrint}
            keepUrl
            size="small"
            // المشتريات وعروض الأسعار: A4، والبيع: المقاس الافتراضي
            // job.paper: ورق محدد (فواتير الإيجار A4)
            defaultPaper={
              job.paper ??
              (isPurchase || job.kind === "quotation"
                ? "A4"
                : (data.settings?.paperSize ?? "80mm"))
            }
            fileName={docNo}
            renderDoc={renderDoc}
          />
        )
      }
    />
  );
}

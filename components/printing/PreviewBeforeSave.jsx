"use client";

import { useState } from "react";
import { Alert, Button } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { getPreviewContextAction } from "@/actions/invoice-print.actions";
import SaleDocument from "@/components/sales/SaleDocument";
import PurchaseDocument from "@/components/purchases/PurchaseDocument";
import InvoiceA4 from "./invoice/InvoiceA4";
import DocPreviewModal from "./DocPreviewModal";

const SEQ = {
  sale: "sale",
  return: "saleReturn",
  quotation: "quotation",
  purchase: "purchase",
  purchaseReturn: "purchaseReturn",
};

// ============================================================
// زرار "معاينة" في شاشات إنشاء الفواتير (قبل الحفظ)
// kind: sale | return | quotation | purchase | purchaseReturn
// buildDoc(ctx): بيرجّع المستند من البيانات اللي على الشاشة
//   ctx = { branch, user, number } — أو null لو مفيش أصناف لسه
// المعاينة للعرض بس (من غير طباعة): الطباعة بعد الحفظ
// ============================================================
export default function PreviewBeforeSave({
  kind,
  buildDoc,
  size = "large",
  block,
  className,
}) {
  const [ctx, setCtx] = useState(null);
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const t = useTranslations("Exports");
  const tAlerts = useTranslations("Alerts");
  const isPurchase = kind === "purchase" || kind === "purchaseReturn";

  const open = async () => {
    let c = ctx;
    if (!c) {
      setLoading(true);
      const res = await getPreviewContextAction(SEQ[kind]);
      setLoading(false);
      if (!res.success) return message.error(tAlerts(res.error));
      c = res.data;
      setCtx(c);
    }
    const built = buildDoc({ ...c, number: c.number, docCode: c.docCode });
    if (!built) return message.warning(tAlerts("NoItems"));
    setDoc(built);
  };

  const renderDoc = (paper) => {
    const settings = { ...ctx.settings, paperSize: paper };
    if (paper === "A4") {
      return (
        <InvoiceA4
          kind={kind}
          doc={doc}
          company={ctx.company}
          settings={settings}
        />
      );
    }
    return isPurchase ? (
      <PurchaseDocument
        settings={settings}
        company={ctx.company}
        purchase={doc}
      />
    ) : (
      <SaleDocument
        settings={settings}
        company={ctx.company}
        doc={doc}
        kind={kind}
      />
    );
  };

  return (
    <>
      <Button
        size={size}
        block={block}
        className={className}
        color="cyan"
        variant="solid"
        icon={<EyeOutlined />}
        loading={loading}
        onClick={open}
      >
        {t("Preview")}
      </Button>
      {doc && ctx && (
        <DocPreviewModal
          open
          onClose={() => setDoc(null)}
          renderDoc={renderDoc}
          defaultPaper={isPurchase ? "A4" : (ctx.settings.paperSize ?? "80mm")}
          thermal={
            ctx.settings.paperSize === "A4"
              ? "80mm"
              : (ctx.settings.paperSize ?? "80mm")
          }
          banner={
            <Alert
              type="warning"
              showIcon
              className="mb-3"
              title={t("PreviewNotSaved")}
            />
          }
        />
      )}
    </>
  );
}

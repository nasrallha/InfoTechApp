"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Alert, Button, Input, Modal, Space } from "antd";
import { FilePdfOutlined, WhatsAppOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { useCompany } from "@/components/common/CompanyProvider";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { renderPdfBlob } from "@/lib/pdf";
import { openWhatsApp, pdfFile, sendPdf, waNumber } from "@/lib/whatsapp";
import { formatDay } from "@/lib/dates";
import { saleDocNo } from "@/lib/doc-number";

// ============================================================
// نصوص رسائل واتساب للعميل (الطلب / الفاتورة)
// ============================================================
export function useWaMessages() {
  const t = useTranslations("Laundry");
  const company = useCompany();
  const { amount: money, symbol } = useCurrency();
  const shop = company?.arName ?? "";
  const cur = (v) => `${money(v)} ${symbol}`;
  return {
    // الطلب: مستلَم / جاهز
    order: (o) =>
      t(o.status === "ready" ? "WaMsgReady" : "WaMsgReceived", {
        name: o.customerName,
        no: o.dailyNo,
        day: formatDay(o.bizDay),
        pieces: o.totalQty,
        total: cur(o.totalAmount),
        shop,
      }),
    // الفاتورة (+ رصيد الاشتراك لو اتدفعت منه)
    invoice: (s) =>
      [
        t("WaMsgInvoice", {
          name: s.customerArName || "",
          invoice: saleDocNo(s.type ?? "sale", s.number, s.docCode),
          total: cur(s.totalAmount),
          shop,
        }),
        s.laundry?.walletBalance != null
          ? t("WaMsgBalance", { balance: cur(s.laundry.walletBalance) })
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
  };
}

// ============================================================
// نافذة الإرسال على واتساب (مجاني: wa.me)
// - الرسالة جاهزة وتتعدل قبل الإرسال
// - "واتساب": يفتح المحادثة بالرسالة، والكاشير يدوس إرسال
// - "الفاتورة PDF" (لو فيه مستند): قائمة المشاركة (واتساب) لو الجهاز بيدعمها،
//   غير كده الملف بيتنزل وواتساب بيفتح (اسحب الملف على المحادثة)
// pdf: { paperSize, fileName, doc } ← doc = المستند (SaleDocument...)
// ============================================================
export default function WhatsAppSend({ phone, text, pdf, title, onClose }) {
  const t = useTranslations("Laundry");
  const [msg, setMsg] = useState(text ?? "");
  const docRef = useRef(null);
  const valid = Boolean(waNumber(phone));
  // الفاتورة PDF بتتجهز أول ما النافذة تفتح: المتصفح بيسمح بالمشاركة وفتح
  // واتساب بس من الضغطة نفسها، فالملف لازم يكون جاهز ساعتها
  const [file, setFile] = useState(null);
  const [pdfError, setPdfError] = useState(false);
  useEffect(() => {
    if (!pdf) return;
    let alive = true;
    // ننتظر رسم المستند (الشعار والـ QR)
    const timer = setTimeout(async () => {
      try {
        if (!docRef.current) return;
        const blob = await renderPdfBlob(docRef.current, pdf.paperSize);
        if (alive) setFile(pdfFile(blob, pdf.fileName));
      } catch (e) {
        console.error(e);
        if (alive) setPdfError(true);
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // مرة واحدة لكل نافذة
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = () => {
    if (!openWhatsApp(phone, msg)) message.warning(t("WaPopupBlocked"));
  };

  const sendFile = async () => {
    const how = await sendPdf(file, { phone, text: msg });
    if (how === "downloaded") message.info(t("WaPdfDownloaded"));
  };

  return (
    <Modal
      open
      width={560}
      title={
        <span>
          <WhatsAppOutlined /> {title ?? t("WaSend")}
        </span>
      }
      footer={null}
      onCancel={onClose}
      destroyOnHidden
    >
      {!valid && (
        <Alert type="warning" showIcon className="mb-3" title={t("WaNoPhone")} />
      )}
      <div className="mb-2" style={{ fontWeight: 700 }}>
        <bdi dir="ltr">{phone || "—"}</bdi>
      </div>
      <Input.TextArea
        autoSize={{ minRows: 4, maxRows: 10 }}
        maxLength={1500}
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        className="mb-3"
      />
      <Space wrap>
        <Button
          type="primary"
          className="wa-btn"
          icon={<WhatsAppOutlined />}
          disabled={!valid}
          onClick={open}
        >
          {t("WaOpen")}
        </Button>
        {pdf && (
          <Button
            icon={<FilePdfOutlined />}
            loading={!file && !pdfError}
            disabled={!valid || !file}
            onClick={sendFile}
          >
            {t("WaPdf")}
          </Button>
        )}
      </Space>
      {pdf && (
        <div className="mt-2" style={{ fontSize: 12, opacity: 0.75 }}>
          {pdfError ? t("WaPdfFailed") : t("WaPdfHint")}
        </div>
      )}

      {/* المستند مرسوم برا الشاشة عشان يتحول PDF */}
      {pdf &&
        createPortal(
          <div
            style={{ position: "fixed", top: 0, left: -10000, zIndex: -1, background: "#fff" }}
          >
            <div ref={docRef} style={{ display: "inline-block", background: "#fff" }}>
              {pdf.doc}
            </div>
          </div>,
          document.body,
        )}
    </Modal>
  );
}

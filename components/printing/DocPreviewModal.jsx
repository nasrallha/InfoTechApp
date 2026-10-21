"use client";

import { useState } from "react";
import { Button, Modal, Segmented, Space } from "antd";
import { FilePdfOutlined, PrinterOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import ScaledBox from "./ScaledBox";
import { PRINT_AREA } from "./invoice/InvoiceView";

const PX_PER_MM = 96 / 25.4;

// ============================================================
// معاينة المستند قبل الطباعة (كاشير أو A4) بنفس شكل الطباعة بالظبط
// renderDoc(paper): يرسم المستند على المقاس المطلوب
// onPrint(paper) / onPdf(paper): الطباعة أو التنزيل من جوه المعاينة
// ============================================================
export default function DocPreviewModal({
  open,
  onClose,
  renderDoc,
  defaultPaper = "A4",
  thermal = "80mm",
  a4Only,
  onPrint,
  onPdf,
  banner, // تنبيه أعلى المعاينة (مثلاً: غير محفوظة)
}) {
  const t = useTranslations("Exports");
  const [paper, setPaper] = useState(a4Only ? "A4" : defaultPaper);
  const widthPx = Math.round((PRINT_AREA[paper] ?? 72) * PX_PER_MM);
  // A4 بيتصغّر عشان يدخل في الشاشة، والكاشير بيتكبّر شوية عشان يتقري
  const scale = paper === "A4" ? Math.min(1, 760 / widthPx) : 1.25;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={paper === "A4" ? 860 : 520}
      title={t("Preview")}
      destroyOnHidden
      footer={
        <Space wrap>
          <Button onClick={onClose}>{t("Close")}</Button>
          {onPdf && (
            <Button
              icon={<FilePdfOutlined style={{ color: "#c0392b" }} />}
              onClick={() => onPdf(paper)}
            >
              {t("Pdf")}
            </Button>
          )}
          {onPrint && (
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              onClick={() => onPrint(paper)}
            >
              {t("Print")}
            </Button>
          )}
        </Space>
      }
    >
      {banner}
      {!a4Only && (
        <Segmented
          className="mb-3"
          value={paper}
          onChange={setPaper}
          options={[
            { value: thermal, label: t("ThermalPaper", { size: thermal }) },
            { value: "A4", label: t("A4Paper") },
          ]}
        />
      )}
      <div
        style={{
          background: "#e9edf2",
          padding: 16,
          borderRadius: 8,
          maxHeight: "70vh",
          overflow: "auto",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div style={{ background: "#fff", boxShadow: "0 2px 10px #0002" }}>
          <ScaledBox width={widthPx} scale={scale}>
            {renderDoc(paper)}
          </ScaledBox>
        </div>
      </div>
    </Modal>
  );
}

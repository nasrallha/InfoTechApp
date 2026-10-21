"use client";

import { useState } from "react";
import { Button, Space } from "antd";
import {
  FileExcelOutlined,
  FilePdfOutlined,
  PrinterOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { exportExcel } from "@/lib/excel";
import { message } from "@/components/common/feedback";
import PrintDocument from "@/components/printing/PrintDocument";
import PdfDocument from "@/components/printing/PdfDocument";
import ReportSheet from "./ReportSheet";

// ============================================================
// أزرار التصدير لأي تقرير/قائمة: Excel + طباعة A4 + PDF
// build(): يرجع شكل التقرير (انظر ReportSheet و lib/excel)
// loadAll(): (اختياري) يجيب كل الصفوف قبل التصدير (للقوائم المقسمة صفحات)
// ============================================================
export default function ExportButtons({
  build,
  loadAll,
  disabled,
  size = "middle",
}) {
  const t = useTranslations("Exports");
  const locale = useLocale();
  const [busy, setBusy] = useState(null);
  const [mode, setMode] = useState(null); // "print" | "pdf"
  const [report, setReport] = useState(null);

  const labels = {
    printedAt: t("PrintedAt"),
    printedBy: t("PrintedBy"),
    taxNo: t("TaxNo"),
  };

  const prepare = async () => {
    const extra = loadAll ? await loadAll() : undefined;
    if (extra === null) return null;
    const r = build(extra);
    return { totalLabel: t("Total"), ...r };
  };

  const run = async (kind) => {
    setBusy(kind);
    try {
      const r = await prepare();
      if (!r) return setBusy(null);
      if (kind === "excel") {
        await exportExcel({ ...r, rtl: locale === "ar" });
        setBusy(null);
      } else {
        setReport(r);
        setMode(kind);
      }
    } catch (e) {
      console.error(e);
      message.error(t("ExportFailed"));
      setBusy(null);
    }
  };

  const done = () => {
    setMode(null);
    setReport(null);
    setBusy(null);
  };

  return (
    <>
      <Space wrap>
        <Button
          size={size}
          icon={<FileExcelOutlined style={{ color: "#1d6f42" }} />}
          loading={busy === "excel"}
          disabled={disabled || (busy && busy !== "excel")}
          onClick={() => run("excel")}
        >
          {t("Excel")}
        </Button>
        <Button
          size={size}
          icon={<PrinterOutlined />}
          loading={busy === "print"}
          disabled={disabled || (busy && busy !== "print")}
          onClick={() => run("print")}
        >
          {t("Print")}
        </Button>
        <Button
          size={size}
          icon={<FilePdfOutlined style={{ color: "#c0392b" }} />}
          loading={busy === "pdf"}
          disabled={disabled || (busy && busy !== "pdf")}
          onClick={() => run("pdf")}
        >
          {t("Pdf")}
        </Button>
      </Space>
      {mode === "print" && report && (
        <PrintDocument paperSize="A4" margin={10} onDone={done}>
          <ReportSheet report={report} labels={labels} fixedWidth={false} />
        </PrintDocument>
      )}
      {mode === "pdf" && report && (
        <PdfDocument
          paperSize="A4"
          fileName={report.fileName || report.title}
          onDone={done}
        >
          <ReportSheet report={report} labels={labels} />
        </PdfDocument>
      )}
    </>
  );
}

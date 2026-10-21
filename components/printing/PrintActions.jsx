"use client";

import { useEffect, useState } from "react";
import { Button, Dropdown, Space } from "antd";
import {
  DownOutlined,
  EyeOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  PrinterOutlined,
} from "@ant-design/icons";
import { useTranslations } from "next-intl";
import PrintDocument from "./PrintDocument";
import PdfDocument from "./PdfDocument";
import DocPreviewModal from "./DocPreviewModal";

// ============================================================
// أزرار طباعة المستند: زرار واضح لكل مقاس (كاشير / A4) + تنزيل PDF بالشكلين
// renderDoc(paperSize): يرسم المستند على المقاس المطلوب
// defaultPaper: مقاس الطباعة الافتراضي (من إعدادات طباعة الفواتير)
// autoPrint: يطبع فور فتح الشاشة (true = المقاس الافتراضي، "A4" أو "thermal" = المقاس ده)
// thermalOnly / a4Only: لو المستند له شكل واحد فقط
// ============================================================
export default function PrintActions({
  renderDoc,
  fileName,
  defaultPaper = "80mm",
  autoPrint,
  size = "large",
  a4Only,
  keepUrl, // لا نشيل ?print=1 من الرابط (لما الطباعة من نفس الشاشة)
}) {
  const t = useTranslations("Exports");
  const thermal = defaultPaper === "A4" ? "80mm" : defaultPaper;
  const def = a4Only ? "A4" : defaultPaper;
  const autoPaper =
    autoPrint === "A4" || (autoPrint === "thermal" && a4Only)
      ? "A4"
      : autoPrint === "thermal"
        ? thermal
        : def;
  const [job, setJob] = useState(
    autoPrint ? { mode: "print", paper: autoPaper } : null,
  );
  const printing = (paper) => job?.mode === "print" && job.paper === paper;
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (autoPrint && !keepUrl) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [autoPrint, keepUrl]);

  const paperItems = (mode) =>
    [
      !a4Only && {
        key: `${mode}:${thermal}`,
        label: t("ThermalPaper", { size: thermal }),
      },
      { key: `${mode}:A4`, label: t("A4Paper") },
    ].filter(Boolean);

  const onMenu = ({ key }) => {
    const [mode, paper] = key.split(":");
    setJob({ mode, paper });
  };

  return (
    <>
      <Space wrap size={8}>
        {/* معاينة قبل الطباعة (لون مختلف ومنفصلة عن زرار الطباعة) */}
        <Button
          size={size}
          color="cyan"
          variant="solid"
          icon={<EyeOutlined />}
          onClick={() => setPreviewOpen(true)}
        >
          {t("Preview")}
        </Button>
        {!a4Only && (
          <Button
            size={size}
            color="blue"
            variant="solid"
            icon={<PrinterOutlined />}
            loading={printing(thermal)}
            onClick={() => setJob({ mode: "print", paper: thermal })}
          >
            {t("PrintThermal")}
          </Button>
        )}
        <Button
          size={size}
          color="purple"
          variant="solid"
          icon={<FileTextOutlined />}
          loading={printing("A4")}
          onClick={() => setJob({ mode: "print", paper: "A4" })}
        >
          {t("PrintA4")}
        </Button>
        {a4Only ? (
          <Button
            size={size}
            color="red"
            variant="solid"
            icon={<FilePdfOutlined />}
            loading={job?.mode === "pdf"}
            onClick={() => setJob({ mode: "pdf", paper: "A4" })}
          >
            {t("Pdf")}
          </Button>
        ) : (
          <Dropdown menu={{ items: paperItems("pdf"), onClick: onMenu }}>
            <Button
              size={size}
              color="red"
              variant="solid"
              icon={<FilePdfOutlined />}
              loading={job?.mode === "pdf"}
            >
              {t("Pdf")} <DownOutlined />
            </Button>
          </Dropdown>
        )}
      </Space>
      <DocPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        renderDoc={renderDoc}
        defaultPaper={def}
        thermal={thermal}
        a4Only={a4Only}
        onPrint={(paper) => {
          setPreviewOpen(false);
          setJob({ mode: "print", paper });
        }}
        onPdf={(paper) => {
          setPreviewOpen(false);
          setJob({ mode: "pdf", paper });
        }}
      />
      {job?.mode === "print" && (
        <PrintDocument paperSize={job.paper} onDone={() => setJob(null)}>
          {renderDoc(job.paper)}
        </PrintDocument>
      )}
      {job?.mode === "pdf" && (
        <PdfDocument
          paperSize={job.paper}
          fileName={fileName}
          onDone={() => setJob(null)}
        >
          {renderDoc(job.paper)}
        </PdfDocument>
      )}
    </>
  );
}

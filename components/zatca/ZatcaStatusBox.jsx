"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Card, Descriptions, Space, Tag } from "antd";
import {
  CloudUploadOutlined,
  FileTextOutlined,
  FilePdfOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import { saleDocNo } from "@/lib/doc-number";
import { downloadBlob } from "@/lib/excel";
import {
  getZatcaXmlAction,
  sendZatcaInvoiceAction,
} from "@/actions/zatca.actions";
import PdfDocument from "@/components/printing/PdfDocument";
import {
  DOC_STATUS_COLOR,
  EnvTag,
  showZatcaError,
  showZatcaResult,
} from "./zatcaUi";
import { C } from "@/lib/theme";
import "./zatca.css";

// ============================================================
// حالة الفاتورة الإلكترونية في شاشة الفاتورة:
// الحالة عند الهيئة، الرسائل، إرسال / إعادة إرسال، تنزيل XML و PDF/A-3
// renderA4(): المستند A4 (للـ PDF)
// ============================================================
export default function ZatcaStatusBox({ sale, canSend, canExport, renderA4 }) {
  const [busy, setBusy] = useState(null);
  const [pdfJob, setPdfJob] = useState(null);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Zatca");
  const tAlerts = useTranslations("Alerts");
  const doc = sale.zatcaDocument;
  const status = doc?.status ?? "unsigned";
  const docNo = saleDocNo(sale.type, sale.number, sale.docCode);
  const searchParams = useSearchParams();
  const autoRan = useRef(false);

  const send = async () => {
    setBusy("send");
    const res = await sendZatcaInvoiceAction({ saleId: sale.id });
    setBusy(null);
    if (!res.success) return showZatcaError(res, { t, tAlerts, locale });
    showZatcaResult(res.data, { t });
    router.refresh();
  };

  const loadXml = async () => {
    const res = await getZatcaXmlAction({ saleId: sale.id });
    if (!res.success) {
      showZatcaError(res, { t, tAlerts, locale });
      return null;
    }
    return res.data;
  };

  const downloadXml = async () => {
    setBusy("xml");
    const data = await loadXml();
    setBusy(null);
    if (data)
      downloadBlob(
        new Blob([data.xml], { type: "application/xml" }),
        data.fileName,
      );
  };

  const downloadPdfA3 = async () => {
    setBusy("pdf");
    const data = await loadXml();
    if (!data) return setBusy(null);
    setPdfJob({ xml: data.xml, name: data.fileName });
  };

  // الضريبية قبل الاعتماد: الـ XML الموقّع مش هو الرسمي
  const exportable =
    doc && !(doc.kind === "standard" && doc.status !== "cleared");

  // جاي من شاشة متابعة الفواتير: ?zatca=pdf أو ?zatca=xml ← ننزّل الملف على طول
  const auto = searchParams.get("zatca");
  useEffect(() => {
    if (autoRan.current || !auto || !canExport || !exportable) return;
    autoRan.current = true;
    if (auto === "pdf") downloadPdfA3();
    else if (auto === "xml") downloadXml();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, canExport, exportable]);

  const messages = [
    ...(doc?.errors ?? []).map((m) => ({ ...m, type: "error" })),
    ...(doc?.warnings ?? []).map((m) => ({ ...m, type: "warning" })),
  ];
  const canResend = ["pending", "error", "rejected", "unsigned"].includes(
    status,
  );

  return (
    <Card
      size="small"
      className="mb-3"
      title={
        <Space wrap>
          <SafetyCertificateOutlined />
          <span>{t("EInvoice")}</span>
          <Tag color={DOC_STATUS_COLOR[status]}>{t(`docStatus.${status}`)}</Tag>
          {doc && <Tag>{t(`kind.${doc.kind}`)}</Tag>}
          {doc && <EnvTag env={doc.environment} t={t} />}
        </Space>
      }
      extra={
        <Space wrap>
          {canSend && canResend && (
            <Button
              size="small"
              type="primary"
              icon={<CloudUploadOutlined />}
              loading={busy === "send"}
              onClick={send}
            >
              {status === "unsigned"
                ? t("SignAndSend")
                : status === "pending"
                  ? t("SendNow")
                  : t("Resend")}
            </Button>
          )}
          {canExport && exportable && (
            <>
              <Button
                size="small"
                icon={<FileTextOutlined />}
                loading={busy === "xml"}
                onClick={downloadXml}
              >
                XML
              </Button>
              <Button
                size="small"
                icon={<FilePdfOutlined style={{ color: C.dangerText }} />}
                loading={busy === "pdf"}
                onClick={downloadPdfA3}
              >
                PDF/A-3
              </Button>
            </>
          )}
        </Space>
      }
    >
      {!doc ? (
        <Alert type="warning" showIcon title={t("UnsignedHint")} />
      ) : (
        <>
          {doc.kind === "standard" && doc.status !== "cleared" && (
            <Alert
              type="error"
              showIcon
              className="mb-2"
              title={t("StandardNotClearedHint")}
            />
          )}
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2, md: 4 }}
            items={[
              { key: "icv", label: "ICV", children: doc.icv },
              {
                key: "signed",
                label: t("SignedAt"),
                children: formatDateTime(doc.createdAt),
              },
              {
                key: "accepted",
                label: t("AcceptedAt"),
                children: doc.acceptedAt ? formatDateTime(doc.acceptedAt) : "—",
              },
              { key: "attempts", label: t("Attempts"), children: doc.attempts },
              {
                key: "uuid",
                label: "UUID",
                span: { xs: 1, sm: 2, md: 4 },
                children: <bdi style={{ fontSize: 12 }}>{doc.uuid}</bdi>,
              },
            ]}
          />
          {messages.length > 0 && (
            <ul className="zatca-msgs mt-2" style={{ maxWidth: "none" }}>
              {messages.map((m, i) => (
                <li key={i} className={`zatca-msg zatca-msg--${m.type}`}>
                  {[m.code, m.message].filter(Boolean).join(": ")}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {pdfJob && (
        <PdfDocument
          paperSize="A4"
          fileName={docNo}
          attachXml={pdfJob}
          onDone={() => {
            setPdfJob(null);
            setBusy(null);
          }}
        >
          {renderA4()}
        </PdfDocument>
      )}
    </Card>
  );
}

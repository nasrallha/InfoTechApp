"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Card, Switch } from "antd";
import { AndroidOutlined, PrinterOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { formatDateTime } from "@/lib/dates";
import { androidPrintOn, setAndroidPrint } from "@/lib/android-print";
import PrintDocument from "./PrintDocument";
import { PRINT_AREA } from "./invoice/InvoiceView";

// ============================================================
// طباعة أندرويد على الجهاز ده (مش إعداد للشركة): تطبيق RawBT
// - بيطبع الإيصالات الحرارية على طول من غير نافذة الطباعة
// - الطابعة (المدمجة InnerPrinter / بلوتوث / شبكة) بتتختار من جوه RawBT
// - طباعة تجربة بنوع الطباعة على الجهاز ده (paper)
// ============================================================
export default function AndroidPrintCard({ paper: devicePaper = "80mm" }) {
  const t = useTranslations("InvoicePrint");
  const [on, setOn] = useState(false);
  const [testing, setTesting] = useState(false);

  // من التخزين بعد التحميل (السيرفر مايعرفش إعداد الجهاز)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(androidPrintOn());
  }, []);
  // طباعة التجربة: الكاشير بس (A4 ← 80mm)
  const paper = devicePaper === "58mm" ? "58mm" : "80mm";

  const toggle = (v) => {
    if (!setAndroidPrint(v)) return message.error(t("AndroidPrintStorageBlocked"));
    setOn(v);
    message.success(t(v ? "AndroidPrintEnabled" : "AndroidPrintDisabled"));
  };

  return (
    <Card
      size="small"
      title={
        <span>
          <AndroidOutlined /> {t("AndroidPrint")}
        </span>
      }
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <span>{t("AndroidPrintOnDevice")}</span>
        {/* إعداد الجهاز: شغال حتى لو المستخدم مايقدرش يعدّل إعدادات الشركة */}
        <Switch checked={on} disabled={false} onChange={toggle} />
      </div>
      <Alert type="info" showIcon className="mb-3" title={t("AndroidPrintHint")} description={t("AndroidPrintSteps")} />
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<PrinterOutlined />} disabled={false} onClick={() => setTesting(true)}>
          {t("TestPrint")} ({paper})
        </Button>
      </div>

      {/* صفحة تجربة صغيرة (بتروح لـ RawBT لو مفعّل، غير كده نافذة الطباعة) */}
      {testing && (
        <PrintDocument paperSize={paper} onDone={() => setTesting(false)}>
          <div
            className="inv inv--thermal"
            dir="rtl"
            style={{ width: `${PRINT_AREA[paper]}mm`, padding: "2mm", fontSize: "10pt", textAlign: "center" }}
          >
            <div className="inv__title">{t("TestPrintTitle")}</div>
            <div>{paper}</div>
            <div>
              <bdi>{formatDateTime(new Date())}</bdi>
            </div>
          </div>
        </PrintDocument>
      )}
    </Card>
  );
}

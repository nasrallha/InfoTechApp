"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Card, Segmented, Switch } from "antd";
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
// - طباعة تجربة بالمقاس المختار
// ============================================================
export default function AndroidPrintCard() {
  const t = useTranslations("InvoicePrint");
  const [on, setOn] = useState(false);
  const [paper, setPaper] = useState("80mm");
  const [testing, setTesting] = useState(false);

  // من التخزين بعد التحميل (السيرفر مايعرفش إعداد الجهاز)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(androidPrintOn());
  }, []);

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
        <Segmented
          disabled={false}
          value={paper}
          onChange={setPaper}
          options={[
            { value: "80mm", label: "80mm" },
            { value: "58mm", label: "58mm" },
          ]}
        />
        <Button icon={<PrinterOutlined />} disabled={false} onClick={() => setTesting(true)}>
          {t("TestPrint")}
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

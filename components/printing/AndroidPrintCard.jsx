"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Card, Segmented, Switch, Tooltip } from "antd";
import { MobileOutlined, PrinterOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { formatDateTime } from "@/lib/dates";
import { androidPrintOn, setAndroidPrint } from "@/lib/android-print";
import { readDevicePaper, saveDevicePaper } from "@/lib/device-paper";
import PrintDocument from "./PrintDocument";
import { PRINT_AREA } from "./invoice/InvoiceView";

// ============================================================
// الطباعة على الجهاز ده (مش إعداد للشركة):
// - مقاس الورق على الجهاز (جهاز نقطة البيع 58mm والباقي 80mm مثلاً) ← كل شاشات الطباعة
// طباعة أندرويد: تطبيق RawBT
// - بيطبع الإيصالات الحرارية على طول من غير نافذة الطباعة
// - الطابعة (المدمجة InnerPrinter / بلوتوث / شبكة) بتتختار من جوه RawBT
// - طباعة تجربة بالمقاس المختار
// ============================================================
export default function AndroidPrintCard() {
  const t = useTranslations("InvoicePrint");
  const [on, setOn] = useState(false);
  // "" = حسب إعدادات الشركة
  const [devicePaper, setDevicePaper] = useState("");
  const [testing, setTesting] = useState(false);

  // من التخزين بعد التحميل (السيرفر مايعرفش إعداد الجهاز)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(androidPrintOn());
    setDevicePaper(readDevicePaper());
  }, []);
  // طباعة التجربة: مقاس الجهاز (الحراري) أو 80mm
  const paper = devicePaper === "58mm" ? "58mm" : "80mm";

  const pickPaper = (v) => {
    if (!saveDevicePaper(v)) return message.error(t("AndroidPrintStorageBlocked"));
    setDevicePaper(v);
    message.success(t("DevicePaperSaved"));
  };

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
          <MobileOutlined /> {t("DevicePrint")}
        </span>
      }
    >
      {/* مقاس الورق على الجهاز ده (بيغلب مقاس الشركة في كل الشاشات) */}
      <div className="mb-3">
        <div className="mb-1">
          {t("DevicePaper")}{" "}
          <Tooltip title={t("DevicePaperHint")}>
            <QuestionCircleOutlined />
          </Tooltip>
        </div>
        {/* إعداد الجهاز: شغال حتى لو المستخدم مايقدرش يعدّل إعدادات الشركة */}
        <Segmented
          disabled={false}
          value={devicePaper}
          onChange={pickPaper}
          options={[
            { value: "", label: t("DevicePaperCompany") },
            { value: "80mm", label: "80mm" },
            { value: "58mm", label: "58mm" },
            { value: "A4", label: "A4" },
          ]}
        />
        {/* حالة الجهاز ده بوضوح */}
        <div className="mt-2">
          {devicePaper ? (
            <Alert type="success" showIcon title={t("DevicePaperOn", { paper: devicePaper })} />
          ) : (
            <Alert type="info" showIcon title={t("DevicePaperOff")} />
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span>{t("AndroidPrintOnDevice")}</span>
        {/* إعداد الجهاز: شغال حتى لو المستخدم مايقدرش يعدّل إعدادات الشركة */}
        <Switch checked={on} disabled={false} onChange={toggle} />
      </div>
      <Alert type="info" showIcon className="mb-3" title={t("AndroidPrintHint")} description={t("AndroidPrintSteps")} />
      <div className="flex flex-wrap items-center gap-2">
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

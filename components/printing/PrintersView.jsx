"use client";

import { Alert } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import RestaurantPrintersTab from "@/components/restaurant/RestaurantPrintersTab";

// ============================================================
// الطابعات: نفس شاشة طابعات المطعم لكل الأنشطة
// (طابعة كل جهاز وفتح الدرج من «إعدادات الطباعة» على الجهاز نفسه)
// ============================================================
export default function PrintersView(props) {
  const t = useTranslations("Printers");
  return (
    <>
      <PageHeader
        title={
          <span>
            <PrinterOutlined /> {t("Title")}
          </span>
        }
      />
      <Alert type="info" showIcon className="mb-3" title={t("Subtitle")} description={t("DeviceHint")} />
      <RestaurantPrintersTab {...props} />
    </>
  );
}

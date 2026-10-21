"use client";

import { Button, Space } from "antd";
import { FileTextOutlined, PrinterOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { SAVE_PRINT_A4, SAVE_PRINT_THERMAL } from "@/lib/print-param";

// ============================================================
// زرارين "حفظ وطباعة": كاشير أو A4 (بدل زرار واحد بالمقاس الافتراضي)
// onSave(mode): نفس دالة الحفظ في الفورم (mode = print-thermal / print-a4)
// saving: الوضع اللي بيتحفظ دلوقتي (عشان علامة التحميل على الزرار الصح)
// ============================================================
export default function SavePrintButtons({
  onSave,
  saving,
  disabled,
  size = "large",
  a4Only,
}) {
  const t = useTranslations("Exports");
  const off = Boolean(saving) || disabled;
  return (
    // مسافة ثابتة بين الزرارين (حتى لو اللي حواليهم مش Space)
    <Space wrap size={10}>
      {!a4Only && (
        <Button
          size={size}
          color="blue"
          variant="solid"
          icon={<PrinterOutlined />}
          loading={saving === SAVE_PRINT_THERMAL}
          disabled={off}
          onClick={() => onSave(SAVE_PRINT_THERMAL)}
        >
          {t("SaveAndPrintThermal")}
        </Button>
      )}
      <Button
        size={size}
        color="purple"
        variant="solid"
        icon={<FileTextOutlined />}
        loading={saving === SAVE_PRINT_A4}
        disabled={off}
        onClick={() => onSave(SAVE_PRINT_A4)}
      >
        {t("SaveAndPrintA4")}
      </Button>
    </Space>
  );
}

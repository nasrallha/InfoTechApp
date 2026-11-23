"use client";

import { useState } from "react";
import { Button, Card, Segmented, Select, Space, Tooltip } from "antd";
import { InboxOutlined, QuestionCircleOutlined, SaveOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { saveDevicePrinterAction } from "@/actions/invoice-print.actions";
import { Link } from "@/i18n/routing";

// ============================================================
// طابعة الإيصالات على الجهاز ده + فتح الدرج (إعداد الجهاز نفسه)
// printers: طابعات الفرع الحالي (من صفحة الطابعات)
// config: { receiptPrinterId, drawerMode }
// ============================================================
export default function DevicePrinterCard({ printers = [], config, canEdit }) {
  const t = useTranslations("Printers");
  const tAlerts = useTranslations("Alerts");
  const [printerId, setPrinterId] = useState(config?.receiptPrinterId ?? 0);
  const [drawerMode, setDrawerMode] = useState(config?.drawerMode ?? "cash");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await saveDevicePrinterAction({ receiptPrinterId: printerId || null, drawerMode });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts);
    message.success(t("DeviceSaved"));
  };

  const connLabel = (p) =>
    p.connection === "network" ? "IP" : p.connection === "windows" ? "USB" : t("Browser");

  return (
    <Card
      size="small"
      title={
        <span>
          <InboxOutlined /> {t("DeviceCard")}
        </span>
      }
      extra={
        canEdit && (
          <Button size="small" type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>
            {t("Save")}
          </Button>
        )
      }
    >
      <Space orientation="vertical" size={10} style={{ width: "100%" }}>
        <div>
          <div className="mb-1">
            {t("ReceiptPrinter")}{" "}
            <Tooltip title={t("ReceiptPrinterHint")}>
              <QuestionCircleOutlined />
            </Tooltip>
          </div>
          <Select
            style={{ width: "100%" }}
            disabled={!canEdit}
            value={printerId}
            onChange={setPrinterId}
            options={[
              { value: 0, label: t("BrowserPrint") },
              ...printers.map((p) => ({ value: p.id, label: `${p.name} (${connLabel(p)} · ${p.paperSize})` })),
            ]}
          />
          {!printers.length && (
            <div className="text-xs text-slate-500 mt-1">
              {t("NoPrinters")} <Link href="/printing/printers">{t("GoPrinters")}</Link>
            </div>
          )}
        </div>
        <div>
          <div className="mb-1">
            {t("DrawerMode")}{" "}
            <Tooltip title={t("DrawerModeHint")}>
              <QuestionCircleOutlined />
            </Tooltip>
          </div>
          <Segmented
            disabled={!canEdit}
            value={drawerMode}
            onChange={setDrawerMode}
            options={["cash", "cashCard", "always", "never"].map((v) => ({ value: v, label: t(`drawer.${v}`) }))}
          />
        </div>
      </Space>
    </Card>
  );
}

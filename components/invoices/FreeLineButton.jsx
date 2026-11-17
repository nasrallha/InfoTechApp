"use client";

import { useState } from "react";
import { Button, Tooltip } from "antd";
import { FormOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useModuleSettings } from "@/components/auth/AuthProvider";
import { showActionError } from "@/components/common/actionError";
import { freeLineProductAction } from "@/actions/free-line.actions";

// ============================================================
// زرار «بند حر» في فاتورة البيع / الشراء (لو مفعّل للشركة)
// بيجيب الصنف الداخلي ويضيف سطر جديد تكتب فيه الوصف والوحدة والكمية والسعر
// side: sale | purchase | onAdd(product): بيضيف السطر (والشاشة بتعلّمه بند حر)
// ============================================================
export default function FreeLineButton({ side, onAdd }) {
  const t = useTranslations("Invoices");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { freeLines } = useModuleSettings();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  if (!freeLines) return null;

  const add = async () => {
    let p = product;
    if (!p) {
      setLoading(true);
      const res = await freeLineProductAction(side);
      setLoading(false);
      if (!res.success) return showActionError(res, tAlerts, locale);
      p = res.data;
      setProduct(p);
    }
    onAdd(p);
  };

  return (
    <Tooltip title={t("FreeLineHint")}>
      <Button icon={<FormOutlined />} loading={loading} onClick={add}>
        {t("FreeLine")}
      </Button>
    </Tooltip>
  );
}

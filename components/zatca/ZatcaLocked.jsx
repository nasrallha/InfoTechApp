"use client";

import { Button, Result } from "antd";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";

// فاتورة اتوقّعت للزكاة: مينفعش تتعدل (التصحيح بمرتجع / إشعار دائن)
export default function ZatcaLocked({ saleId }) {
  const t = useTranslations("Zatca");
  return (
    <Result
      status="warning"
      title={t("LockedTitle")}
      subTitle={t("LockedText")}
      extra={
        <Link href={`/invoices/sales/${saleId}`}>
          <Button type="primary">{t("BackToInvoice")}</Button>
        </Link>
      }
    />
  );
}

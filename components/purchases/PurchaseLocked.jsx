"use client";

import { Button, Result } from "antd";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { formatDocNo } from "@/lib/doc-number";

// فاتورة شراء عليها مرتجعات: لا تُعدل حتى تُحذف مرتجعاتها
export default function PurchaseLocked({ purchase }) {
  const t = useTranslations("Purchases");
  return (
    <Result
      status="warning"
      title={t("CannotEditTitle", {
        number: formatDocNo("purchase", purchase.number, purchase.docCode),
      })}
      subTitle={t("CannotEditHasReturns")}
      extra={
        <Link href={`/invoices/purchases/${purchase.id}`}>
          <Button type="primary">{t("BackToInvoice")}</Button>
        </Link>
      }
    />
  );
}

"use client";

import { Alert, Button } from "antd";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import "./support.css";

// ============================================================
// تنبيه الاشتراك فوق كل الشاشات (وضع الشركات)
//   expiring: فاضل X يوم | grace: انتهى وفي فترة السماح | readonly: قراءة فقط
// ============================================================
// كله أحمر خفيف (نوع error في antd: خلفية حمرا فاتحة)
const TYPES = { expiring: "error", grace: "error", readonly: "error" };

export default function SubscriptionBanner({ sub }) {
  const t = useTranslations("Support");
  if (!sub || !TYPES[sub.state]) return null;
  const values = {
    days: Math.max(0, sub.daysLeft ?? 0),
    date: sub.endsAt,
    grace: sub.graceEndsAt,
    readonly: sub.readonlyEndsAt,
  };
  return (
    <Alert
      type={TYPES[sub.state]}
      showIcon
      banner
      title={t(`banner.${sub.state}`, values)}
      action={
        <Link href="/contact">
          <Button size="small">{t("ContactUs")}</Button>
        </Link>
      }
      className="sub-banner"
      style={{ marginBottom: 8, borderRadius: 8 }}
    />
  );
}

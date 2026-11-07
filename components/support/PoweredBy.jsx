"use client";

import { useLocale, useTranslations } from "next-intl";
import "./support.css";

// ============================================================
// "تنفيذ: تكنولوجيا المعلومات" (بيانات الشركة المالكة من لوحة التحكم)
// variant: "login" (تحت شاشة الدخول) | "sider" (آخر القايمة الجانبية)
// ============================================================
export default function PoweredBy({ vendor, variant = "login", collapsed }) {
  const t = useTranslations("Support");
  const tAuth = useTranslations("Auth");
  const locale = useLocale();
  const name =
    (locale === "ar" ? vendor?.arName : vendor?.enName) ||
    vendor?.arName ||
    vendor?.enName ||
    tAuth("AppName");
  const href =
    vendor?.website ||
    (vendor?.whatsapp ? `https://wa.me/${vendor.whatsapp}` : null);

  const body = (
    <>
      {vendor?.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={vendor.logo} alt="" className="powered-by__logo" />
      ) : null}
      {!collapsed && (
        <span>
          {t("PoweredBy")} <b>{name}</b>
        </span>
      )}
    </>
  );

  const cls = `powered-by powered-by--${variant}`;
  return href ? (
    <a
      className={cls}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={name}
    >
      {body}
    </a>
  ) : (
    <div className={cls} title={name}>
      {body}
    </div>
  );
}

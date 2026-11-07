"use client";

import { Tag, Tooltip } from "antd";
import { DesktopOutlined, MobileOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { splitDuration } from "@/lib/login-security";

// "10 دقائق" / "ساعتين" / "أسبوع" / "شهر" ... من عدد الدقايق
export function useDuration() {
  const t = useTranslations("Security");
  return (minutes) => {
    const { unit, n } = splitDuration(minutes);
    return t(`dur.${unit}`, { n });
  };
}

// "من 5 دقائق" / "الآن"
export function useAgo() {
  const t = useTranslations("Security");
  const dur = useDuration();
  return (date) => {
    const m = Math.floor((Date.now() - new Date(date).getTime()) / 60_000);
    if (m < 1) return t("JustNow");
    // تقريب للوحدة الأكبر (ساعات / أيام) عشان يبقى مفهوم
    const rounded =
      m < 60
        ? m
        : m < 1440
          ? Math.floor(m / 60) * 60
          : Math.floor(m / 1440) * 1440;
    return t("Ago", { time: dur(rounded) });
  };
}

// اسم المستخدم بالعربي/الإنجليزي + اسم الدخول تحته
export function UserCell({ user, typed }) {
  const locale = useLocale();
  const t = useTranslations("Security");
  if (!user)
    return (
      <span>
        <bdi>{typed}</bdi>{" "}
        <Tag color="default" style={{ marginInlineStart: 4 }}>
          {t("UnknownUser")}
        </Tag>
      </span>
    );
  return (
    <div className="sec-user">
      <b>{locale === "ar" ? user.arFullname : user.enFullname}</b>
      <span className="sec-muted">
        <bdi>{user.username}</bdi> ·{" "}
        {locale === "ar" ? user.role.arName : user.role.enName}
      </span>
    </div>
  );
}

// الجهاز: أيقونة (كمبيوتر/موبايل) + المتصفح والنظام
export function DeviceCell({ device, userAgent }) {
  const t = useTranslations("Security");
  const name =
    [device?.browser, device?.os].filter(Boolean).join(" · ") ||
    t("UnknownDevice");
  return (
    <Tooltip title={userAgent || null}>
      <span className="sec-device">
        {device?.mobile ? <MobileOutlined /> : <DesktopOutlined />} {name}
      </span>
    </Tooltip>
  );
}

// عنوان الجهاز: من الشمال لليمين (عشان العربي ميلخبطش ترتيبه)
// والقديم المتسجل "::1" (الجهاز نفسه) بيتعرض 127.0.0.1
export const Ip = ({ ip }) =>
  ip ? (
    <bdi dir="ltr" className="sec-ip">
      {ip === "::1" ? "127.0.0.1" : ip.replace(/^::ffff:/i, "")}
    </bdi>
  ) : (
    <span className="sec-muted">—</span>
  );

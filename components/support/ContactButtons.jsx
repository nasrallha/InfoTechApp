"use client";

import { Button, Space } from "antd";
import {
  GlobalOutlined,
  MailOutlined,
  PhoneOutlined,
  WhatsAppOutlined,
} from "@ant-design/icons";
import { useTranslations } from "next-intl";

// أزرار التواصل السريع مع الدعم الفني (اتصال / واتساب / إيميل / الموقع)
export default function ContactButtons({ vendor, size = "middle" }) {
  const t = useTranslations("Support");
  if (!vendor) return null;
  const items = [
    vendor.whatsapp && {
      key: "wa",
      icon: <WhatsAppOutlined />,
      label: t("Whatsapp"),
      href: `https://wa.me/${vendor.whatsapp}`,
      type: "primary",
    },
    vendor.phone && {
      key: "phone",
      icon: <PhoneOutlined />,
      label: vendor.phone,
      href: `tel:${vendor.phone.replace(/\s/g, "")}`,
    },
    vendor.email && {
      key: "mail",
      icon: <MailOutlined />,
      label: t("Email"),
      href: `mailto:${vendor.email}`,
    },
    vendor.website && {
      key: "web",
      icon: <GlobalOutlined />,
      label: t("Website"),
      href: vendor.website,
    },
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <Space wrap size={8}>
      {items.map((i) => (
        <Button
          key={i.key}
          size={size}
          type={i.type}
          icon={i.icon}
          href={i.href}
          target={i.key === "phone" || i.key === "mail" ? undefined : "_blank"}
          rel="noopener noreferrer"
        >
          <bdi>{i.label}</bdi>
        </Button>
      ))}
    </Space>
  );
}

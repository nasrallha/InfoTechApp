"use client";

import { Tabs } from "antd";
import {
  ApartmentOutlined,
  BankOutlined,
  FileTextOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import PageHeader from "@/components/common/PageHeader";
import UnitsTab from "./UnitsTab";
import PropertiesTab from "./PropertiesTab";
import OwnersTab from "./OwnersTab";
import TemplatesTab from "./TemplatesTab";

// ============================================================
// تأجير العقارات - الإعداد: الوحدات | العقارات | الملّاك | نماذج العقود
// التبويب في الرابط (?tab=...) عشان التحديث يفضل عليه
// ============================================================
const TABS = ["units", "properties", "owners", "templates"];

export default function RealEstateView({ data, tab, canManage }) {
  const t = useTranslations("RealEstate");
  const router = useRouter();
  const pathname = usePathname();
  const active = TABS.includes(tab) ? tab : "units";

  const items = [
    {
      key: "units",
      icon: <ApartmentOutlined />,
      label: t("Units"),
      children: <UnitsTab data={data} canManage={canManage} />,
    },
    {
      key: "properties",
      icon: <BankOutlined />,
      label: t("Properties"),
      children: <PropertiesTab data={data} canManage={canManage} />,
    },
    {
      key: "owners",
      icon: <UserOutlined />,
      label: t("Owners"),
      children: <OwnersTab data={data} canManage={canManage} />,
    },
    {
      key: "templates",
      icon: <FileTextOutlined />,
      label: t("Templates"),
      children: <TemplatesTab data={data} canManage={canManage} />,
    },
  ];

  return (
    <div>
      <PageHeader title={t("SetupTitle")} />
      <Tabs
        activeKey={active}
        onChange={(k) => router.replace(`${pathname}?tab=${k}`)}
        items={items}
      />
    </div>
  );
}

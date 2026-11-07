"use client";

import { useState } from "react";
import { Tabs } from "antd";
import { useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import LaundryPricesTab from "./LaundryPricesTab";
import LaundryServicesTab from "./LaundryServicesTab";
import LaundryAddonsTab from "./LaundryAddonsTab";
import LaundrySettingsTab from "./LaundrySettingsTab";

// ============================================================
// المغسلة: 3 تابات
// - الأسعار: القطع × الخدمات (عادي + مستعجل)، تعديل جماعي
// - الخدمات: غسيل، غسيل وكي، كي...
// - الإضافات: مجموعات (النشا، المرزام...) وإضافاتها، من غير أسعار
// ============================================================
export default function LaundryView({
  catalog,
  walletSettings,
  initialTab = "prices",
}) {
  const t = useTranslations("Laundry");
  const [tab, setTab] = useState(initialTab);
  const { services, groups, items } = catalog;

  return (
    <>
      <PageHeader title={t("Title")} />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: "prices",
            label: t("Tab_prices"),
            children: <LaundryPricesTab items={items} services={services} />,
          },
          {
            key: "services",
            label: t("Tab_services"),
            children: <LaundryServicesTab services={services} />,
          },
          {
            key: "addons",
            label: t("Tab_addons"),
            children: <LaundryAddonsTab groups={groups} />,
          },
          {
            key: "settings",
            label: t("Tab_settings"),
            children: <LaundrySettingsTab settings={walletSettings} />,
          },
        ]}
      />
    </>
  );
}

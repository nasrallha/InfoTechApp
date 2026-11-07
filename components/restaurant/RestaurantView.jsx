"use client";

import { useState } from "react";
import { Tabs } from "antd";
import {
  AppstoreAddOutlined,
  BarsOutlined,
  CarOutlined,
  ColumnHeightOutlined,
  PrinterOutlined,
  TableOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import RestaurantMenuTab from "./RestaurantMenuTab";
import RestaurantSizesTab from "./RestaurantSizesTab";
import RestaurantModifiersTab from "./RestaurantModifiersTab";
import RestaurantDriversTab from "./RestaurantDriversTab";
import RestaurantSettingsTab from "./RestaurantSettingsTab";
import RestaurantPrintersTab from "./RestaurantPrintersTab";
import RestaurantTablesTab from "./RestaurantTablesTab";
import "./restaurant.css";

// ============================================================
// المطعم / المقهى: المنيو، الأحجام، الإضافات، السائقين، الإعدادات
// ============================================================
export default function RestaurantView({ catalog, initialTab = "menu" }) {
  const t = useTranslations("Restaurant");
  const [tab, setTab] = useState(initialTab);

  return (
    <>
      <PageHeader title={t("Title")} />
      <Tabs
        className="rest-tabs"
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: "menu",
            label: t("Tab_menu"),
            icon: <BarsOutlined />,
            children: <RestaurantMenuTab catalog={catalog} />,
          },
          {
            key: "sizes",
            label: t("Tab_sizes"),
            icon: <ColumnHeightOutlined />,
            children: <RestaurantSizesTab sizes={catalog.sizes} />,
          },
          {
            key: "modifiers",
            label: t("Tab_modifiers"),
            icon: <AppstoreAddOutlined />,
            children: <RestaurantModifiersTab groups={catalog.groups} />,
          },
          {
            key: "drivers",
            label: t("Tab_drivers"),
            icon: <CarOutlined />,
            children: <RestaurantDriversTab drivers={catalog.drivers} />,
          },
          {
            key: "tables",
            label: t("Tab_tables"),
            icon: <TableOutlined />,
            children: (
              <RestaurantTablesTab
                tables={catalog.tables}
                branches={catalog.branches}
              />
            ),
          },
          {
            key: "printers",
            label: t("Tab_printers"),
            icon: <PrinterOutlined />,
            children: (
              <RestaurantPrintersTab
                printers={catalog.printers}
                agents={catalog.agents}
                branches={catalog.branches}
                categories={catalog.categories}
                items={catalog.items}
              />
            ),
          },
          {
            key: "settings",
            label: t("Tab_settings"),
            icon: <SettingOutlined />,
            children: (
              <RestaurantSettingsTab
                settings={catalog.settings}
                channels={catalog.channels}
                tables={catalog.tables}
                branches={catalog.branches}
                online={catalog.online}
                orderCode={catalog.orderCode}
              />
            ),
          },
        ]}
      />
    </>
  );
}

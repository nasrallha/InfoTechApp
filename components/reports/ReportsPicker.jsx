"use client";

import { Modal } from "antd";
import {
  CalendarOutlined,
  LineChartOutlined,
  PieChartOutlined,
  PercentageOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
} from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { useCan } from "@/components/auth/AuthProvider";
import "@/components/invoices/invoices.css";

// التقارير: الرابط + الأيقونة + اللون + الصلاحية
export const REPORTS = [
  {
    key: "profit",
    href: "/reports/profit",
    Icon: LineChartOutlined,
    color: "#1e8449",
    permission: "reports.profit",
  },
  {
    key: "daily",
    href: "/reports/daily",
    Icon: CalendarOutlined,
    color: "#b9770e",
    permission: "reports.daily",
  },
  {
    key: "sales",
    href: "/reports/sales",
    Icon: ShoppingCartOutlined,
    color: "#006266",
    permission: "reports.sales",
  },
  {
    key: "purchases",
    href: "/reports/purchases",
    Icon: ShoppingOutlined,
    color: "#2471a3",
    permission: "reports.purchases",
  },
  {
    key: "vat",
    href: "/reports/vat",
    Icon: PercentageOutlined,
    color: "#7d3c98",
    permission: "reports.vat",
  },
];

export function useVisibleReports() {
  const can = useCan();
  return REPORTS.filter((r) => can(r.permission));
}

// نافذة اختيار التقرير (نفس شكل نافذة الفواتير)
export default function ReportsPicker({ open, onClose }) {
  const t = useTranslations("Reports");
  const router = useRouter();
  const reports = useVisibleReports();

  const go = (href) => {
    onClose();
    router.push(href);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
      centered
      destroyOnHidden
      title={
        <span>
          <PieChartOutlined style={{ marginInlineEnd: 8 }} />
          {t("ChooseReport")}
        </span>
      }
    >
      <div className="invoice-picker">
        {reports.map(({ key, href, Icon, color }) => (
          <button
            key={key}
            type="button"
            className="invoice-picker__item"
            style={{ "--accent": color }}
            onClick={() => go(href)}
          >
            <span className="invoice-picker__icon">
              <Icon />
            </span>
            <span className="invoice-picker__title">{t(`names.${key}`)}</span>
            <span className="invoice-picker__hint">{t(`hints.${key}`)}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

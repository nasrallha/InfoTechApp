"use client";

import { Modal } from "antd";
import {
  AppstoreOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  DiffOutlined,
  ProfileOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { useCan } from "@/components/auth/AuthProvider";
import "@/components/invoices/invoices.css";

// شاشات الحسابات: الرابط + الأيقونة + اللون + الصلاحيات (يكفي واحدة منها)
export const ACCOUNT_PAGES = [
  {
    key: "receipts",
    href: "/accounts/receipts",
    Icon: ArrowDownOutlined,
    color: "#1e8449",
    permissions: ["receipts.view"],
  },
  {
    key: "payments",
    href: "/accounts/payments",
    Icon: ArrowUpOutlined,
    color: "#b03a2e",
    permissions: ["paymentVouchers.view"],
  },
  {
    key: "settlements",
    href: "/accounts/settlements",
    Icon: DiffOutlined,
    color: "#7d3c98",
    permissions: ["settlements.view"],
  },
  {
    key: "statements",
    href: "/accounts/statements",
    Icon: ProfileOutlined,
    color: "#2471a3",
    permissions: ["statements.customers", "statements.suppliers"],
  },
  {
    key: "expenseCategories",
    href: "/accounts/expense-categories",
    Icon: AppstoreOutlined,
    color: "#b9770e",
    permissions: ["expenseCategories.view"],
  },
];

// الشاشات المسموحة للمستخدم (لإظهار زر "الحسابات" في القائمة)
export function useVisibleAccountPages() {
  const can = useCan();
  return ACCOUNT_PAGES.filter((p) => p.permissions.some((x) => can(x)));
}

// نافذة اختيار شاشة الحسابات (نفس شكل نافذة الفواتير والتقارير)
export default function AccountsPicker({ open, onClose }) {
  const t = useTranslations("Accounts");
  const router = useRouter();
  const pages = useVisibleAccountPages();

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
          <WalletOutlined style={{ marginInlineEnd: 8 }} />
          {t("ChoosePage")}
        </span>
      }
    >
      <div className="invoice-picker">
        {pages.map(({ key, href, Icon, color }) => (
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
            <span className="invoice-picker__title">{t(`pages.${key}`)}</span>
            <span className="invoice-picker__hint">
              {t(`pageHints.${key}`)}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

"use client";

import { Modal } from "antd";
import {
  AppstoreOutlined,
  InboxOutlined,
  PlusCircleOutlined,
  SettingOutlined,
  SkinOutlined,
  TagsOutlined,
  ToolOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { useCan } from "@/components/auth/AuthProvider";
import { C } from "@/lib/theme";
import "@/components/invoices/invoices.css";

// شاشات المغسلة: الرابط + الأيقونة + اللون + الصلاحية المطلوبة لظهورها
// (المغسلة بتشتغل من هنا: الاستلام والطلبات والقطع والأسعار والإعداد)
export const LAUNDRY_PAGES = [
  {
    key: "LaundryReceive",
    // الاستلام والفوترة من الكاشير (وضع المغسلة)
    href: "/pos",
    Icon: InboxOutlined,
    color: C.primary,
    permission: "sales.pos",
  },
  {
    key: "LaundryOrders",
    href: "/laundry/orders",
    Icon: UnorderedListOutlined,
    color: C.infoText,
    permission: "laundryOrders.view",
  },
  {
    key: "LaundryPrices",
    href: "/laundry?tab=prices",
    Icon: AppstoreOutlined,
    color: C.successText,
    permission: "laundry.view",
  },
  {
    key: "LaundryAddItem",
    href: "/products/addproduct?laundry=1",
    Icon: PlusCircleOutlined,
    color: C.success,
    permission: "products.create",
  },
  {
    key: "LaundryServices",
    href: "/laundry?tab=services",
    Icon: ToolOutlined,
    color: C.warningText,
    permission: "laundry.view",
  },
  {
    key: "LaundryAddons",
    href: "/laundry?tab=addons",
    Icon: TagsOutlined,
    color: C.purple,
    permission: "laundry.view",
  },
  {
    key: "LaundrySettings",
    href: "/laundry?tab=settings",
    Icon: SettingOutlined,
    color: C.navy,
    permission: "laundry.manage",
  },
];

// الشاشات اللي المستخدم يقدر يفتحها (لإظهار زر "المغسلة" في القائمة)
// صفحات المغسلة كلها من وحدة laundry، فلو الوحدة مقفولة صلاحياتها مقفولة
export function useVisibleLaundryPages() {
  const can = useCan();
  const laundryOn = can("laundry.view") || can("laundryOrders.view");
  return laundryOn ? LAUNDRY_PAGES.filter((p) => can(p.permission)) : [];
}

// نافذة في نص الشاشة: كروت كبيرة لكل شاشة، الضغط على كارت يفتحها
export default function LaundryPicker({ open, onClose }) {
  const t = useTranslations("Sidebar");
  const tL = useTranslations("Laundry");
  const router = useRouter();
  const pages = useVisibleLaundryPages();

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
          <SkinOutlined style={{ marginInlineEnd: 8 }} />
          {tL("ChoosePage")}
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
            <span className="invoice-picker__title">{t(key)}</span>
            <span className="invoice-picker__hint">{tL(`short.${key}`)}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

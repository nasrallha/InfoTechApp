"use client";

import { Modal } from "antd";
import {
  ShoppingCartOutlined,
  RollbackOutlined,
  ShoppingOutlined,
  UndoOutlined,
  FileSearchOutlined,
  FileDoneOutlined,
  GlobalOutlined,
} from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { useCan, useModule } from "@/components/auth/AuthProvider";
import { C } from "@/lib/theme";
import "./invoices.css";

// أنواع الفواتير: الرابط + الأيقونة + اللون + الصلاحية المطلوبة لظهورها
export const INVOICE_TYPES = [
  {
    key: "SalesInvoice",
    href: "/invoices/sales",
    Icon: ShoppingCartOutlined,
    color: C.primary,
    permission: "sales.view",
  },
  // فاتورة تصدير (عميل برّه المملكة - ضريبة صفرية): بتفتح فاتورة بيع جديدة بنوع تصدير
  {
    key: "ExportInvoice",
    href: "/invoices/sales/new?export=1",
    Icon: GlobalOutlined,
    color: C.primary,
    permission: "sales.create",
  },
  {
    key: "SalesReturn",
    href: "/invoices/sales-returns",
    Icon: RollbackOutlined,
    color: C.dangerText,
    permission: "salesReturns.view",
  },
  {
    key: "PurchaseInvoice",
    href: "/invoices/purchases",
    Icon: ShoppingOutlined,
    color: C.infoText,
    permission: "purchases.view",
  },
  {
    key: "PurchaseReturn",
    href: "/invoices/purchase-returns",
    Icon: UndoOutlined,
    color: C.warningText,
    permission: "purchaseReturns.view",
  },
  {
    key: "Quotation",
    href: "/invoices/quotations",
    Icon: FileSearchOutlined,
    color: C.purple,
    permission: "quotations.view",
  },
];

// هل المستخدم يقدر يفتح أي نوع فاتورة؟ (لإظهار زر "الفواتير" في القائمة)
// نظام المغسلة: الفوترة من الكاشير (وضع المغسلة)، ففاتورة البيع والتصدير وعرض السعر مش ظاهرين
const LAUNDRY_HIDDEN = ["SalesInvoice", "ExportInvoice", "Quotation"];

export function useVisibleInvoiceTypes() {
  const can = useCan();
  const laundryOn = useModule("laundry");
  return INVOICE_TYPES.filter(
    (type) =>
      can(type.permission) && !(laundryOn && LAUNDRY_HIDDEN.includes(type.key)),
  );
}

// نافذة في نص الشاشة: كروت كبيرة لكل نوع فاتورة، الضغط على كارت يفتح صفحته
export default function InvoiceTypePicker({ open, onClose }) {
  const t = useTranslations("Sidebar");
  const tInvoices = useTranslations("Invoices");
  const router = useRouter();
  const types = useVisibleInvoiceTypes();

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
          <FileDoneOutlined style={{ marginInlineEnd: 8 }} />
          {tInvoices("ChooseType")}
        </span>
      }
    >
      <div className="invoice-picker">
        {types.map(({ key, href, Icon, color }) => (
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
            <span className="invoice-picker__hint">
              {tInvoices(`short.${key}`)}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

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
import { useCan } from "@/components/auth/AuthProvider";
import "./invoices.css";

// أنواع الفواتير: الرابط + الأيقونة + اللون + الصلاحية المطلوبة لظهورها
export const INVOICE_TYPES = [
  {
    key: "SalesInvoice",
    href: "/invoices/sales",
    Icon: ShoppingCartOutlined,
    color: "#006266",
    permission: "sales.view",
  },
  // فاتورة تصدير (عميل برّه المملكة - ضريبة صفرية): بتفتح فاتورة بيع جديدة بنوع تصدير
  {
    key: "ExportInvoice",
    href: "/invoices/sales/new?export=1",
    Icon: GlobalOutlined,
    color: "#117a65",
    permission: "sales.create",
  },
  {
    key: "SalesReturn",
    href: "/invoices/sales-returns",
    Icon: RollbackOutlined,
    color: "#c0392b",
    permission: "salesReturns.view",
  },
  {
    key: "PurchaseInvoice",
    href: "/invoices/purchases",
    Icon: ShoppingOutlined,
    color: "#2471a3",
    permission: "purchases.view",
  },
  {
    key: "PurchaseReturn",
    href: "/invoices/purchase-returns",
    Icon: UndoOutlined,
    color: "#d35400",
    permission: "purchaseReturns.view",
  },
  {
    key: "Quotation",
    href: "/invoices/quotations",
    Icon: FileSearchOutlined,
    color: "#7d3c98",
    permission: "quotations.view",
  },
];

// هل المستخدم يقدر يفتح أي نوع فاتورة؟ (لإظهار زر "الفواتير" في القائمة)
export function useVisibleInvoiceTypes() {
  const can = useCan();
  return INVOICE_TYPES.filter((type) => can(type.permission));
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

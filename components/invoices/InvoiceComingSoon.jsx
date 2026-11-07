"use client";
import { Result, Tag } from "antd";
import {
  ShoppingCartOutlined,
  RollbackOutlined,
  ShoppingOutlined,
  UndoOutlined,
  FileSearchOutlined,
} from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { C } from "@/lib/theme";

// أيقونة كل نوع فاتورة
const ICONS = {
  SalesInvoice: ShoppingCartOutlined,
  SalesReturn: RollbackOutlined,
  PurchaseInvoice: ShoppingOutlined,
  PurchaseReturn: UndoOutlined,
  Quotation: FileSearchOutlined,
};

// صفحة مؤقتة لكل نوع فاتورة حتى نبنيها (الرابط والصلاحية جاهزين من الآن)
// type: SalesInvoice / SalesReturn / PurchaseInvoice / PurchaseReturn / Quotation
export default function InvoiceComingSoon({ type }) {
  const tSidebar = useTranslations("Sidebar");
  const t = useTranslations("Invoices");
  const Icon = ICONS[type] ?? ShoppingCartOutlined;

  return (
    <Result
      icon={<Icon style={{ color: C.primary }} />}
      title={tSidebar(type)}
      subTitle={t(`descriptions.${type}`)}
      extra={<Tag color="processing">{t("ComingSoon")}</Tag>}
    />
  );
}

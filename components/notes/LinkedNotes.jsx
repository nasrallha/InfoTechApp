"use client";

import { Button, Dropdown } from "antd";
import {
  FileAddOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
} from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import { purchaseDocNo, saleDocNo } from "@/lib/doc-number";
import { useCurrency } from "@/components/common/CurrencyProvider";

// ============================================================
// الإشعارات على الفاتورة (في صفحة عرض الفاتورة)
// side: "sale" | "purchase"
// ============================================================
const BASE = {
  sale: "/invoices/sales-notes",
  purchase: "/invoices/purchase-notes",
};

export function LinkedNotes({ side, notes }) {
  const t = useTranslations("Notes");
  const { amount: money } = useCurrency();
  if (!notes?.length) return null;
  const docNo = side === "sale" ? saleDocNo : purchaseDocNo;
  return (
    <div className="mt-4">
      <b>{t("NotesOfInvoice")}</b>
      {notes.map((r) => (
        <div key={r.id} className="pur-totals">
          <div>
            <Link href={`${BASE[side]}/${r.id}`}>
              {t(`type.${r.type}`)} <bdi>{docNo(r.type, r.number)}</bdi>
            </Link>
            <span>
              <bdi>{formatDateTime(r.date)}</bdi> —{" "}
              <bdi>
                {r.type === "credit" ? "-" : "+"}
                {money(r.totalAmount)}
              </bdi>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// زر "إشعار" على الفاتورة: دائن / مدين (بيفتح الشاشة ومعاها الفاتورة)
export function NoteButton({ side, invoiceId }) {
  const t = useTranslations("Notes");
  const router = useRouter();
  const key = side === "sale" ? "sale" : "purchase";
  const go = (type) =>
    router.push(`${BASE[side]}/new?type=${type}&${key}=${invoiceId}`);
  return (
    <Dropdown
      trigger={["click"]}
      menu={{
        items: [
          {
            key: "credit",
            icon: <MinusCircleOutlined />,
            label: t("new.credit"),
          },
          {
            key: "debit",
            icon: <PlusCircleOutlined />,
            label: t("new.debit"),
          },
        ],
        onClick: ({ key: type }) => go(type),
      }}
    >
      <Button icon={<FileAddOutlined />}>{t("MakeNote")}</Button>
    </Dropdown>
  );
}

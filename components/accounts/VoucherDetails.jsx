"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Descriptions,
  Popconfirm,
  Space,
  Table,
  Tag,
} from "antd";
import {
  DeleteOutlined,
  FileTextOutlined,
  PlusOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import { formatDocNo, saleDocNo } from "@/lib/doc-number";
import { deleteVoucherAction } from "@/actions/account.actions";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import PrintActions from "@/components/printing/PrintActions";
import VoucherDocument from "./VoucherDocument";
import { PARTY_TAG, VOUCHER_COLOR, VOUCHER_PATH } from "./voucherConfig";

// ============================================================
// عرض سند: البيانات، التوزيع على الفواتير، الطباعة و PDF، الحذف
// ============================================================
export default function VoucherDetails({
  voucher: v,
  printSettings,
  canCreate,
  canDelete,
  autoPrint,
}) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Accounts");
  const tAlerts = useTranslations("Alerts");
  const { amount: money, symbol } = useCurrency();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const docNo = formatDocNo(v.type, v.number);
  const shiftClosed = v.shift && v.shift.status !== "open";
  const kind = v.customerId ? "customer" : v.supplierId ? "supplier" : null;

  const remove = async () => {
    setDeleting(true);
    const res = await deleteVoucherAction(v.id);
    if (!res.success) {
      setDeleting(false);
      return showActionError(res, tAlerts, locale);
    }
    message.success(t("VoucherDeleted"));
    router.replace(VOUCHER_PATH[v.type]);
    router.refresh();
  };

  const items = [
    {
      key: "no",
      label: t("VoucherNo"),
      children: (
        <b>
          <bdi>{docNo}</bdi>
        </b>
      ),
    },
    {
      key: "date",
      label: t("Date"),
      children: <bdi>{formatDateTime(v.date)}</bdi>,
    },
    {
      key: "pt",
      label: t("PartyType"),
      children: (
        <Tag color={PARTY_TAG[v.partyType]}>
          {t(`party.${v.type}.${v.partyType}`)}
        </Tag>
      ),
    },
    {
      key: "party",
      label: t("Party"),
      children: locale === "ar" ? v.partyArName : v.partyEnName,
    },
    {
      key: "amount",
      label: t("Amount"),
      children: (
        <b style={{ color: VOUCHER_COLOR[v.type], fontSize: 16 }}>
          {money(v.amount)} {symbol}
        </b>
      ),
    },
    v.paymentMethod && {
      key: "m",
      label: t("PaymentMethod"),
      children: nameOf(v.paymentMethod),
    },
    v.reference && { key: "ref", label: t("Reference"), children: v.reference },
    v.balanceAfter != null && {
      key: "bal",
      label: t("BalanceAfterVoucher"),
      children: (
        <b>
          {money(Math.abs(v.balanceAfter))}{" "}
          {v.balanceAfter < -0.0001 &&
            t(`creditBalance.${v.customerId ? "customer" : "supplier"}`)}
        </b>
      ),
    },
    { key: "branch", label: t("Branch"), children: nameOf(v.branch) },
    v.shift && {
      key: "shift",
      label: t("Shift"),
      children: (
        <Link href={`/sales/shifts/${v.shift.id}`}>
          {formatDocNo("shift", v.shift.number)}
        </Link>
      ),
    },
    {
      key: "user",
      label: t("CreatedBy"),
      children:
        locale === "ar" ? v.createdBy?.arFullname : v.createdBy?.enFullname,
    },
    v.notes && { key: "notes", label: t("Notes"), children: v.notes, span: 2 },
  ].filter(Boolean);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1
          className="font-bold text-xl"
          style={{ color: VOUCHER_COLOR[v.type] }}
        >
          {t(`title.${v.type}`)} <bdi>{docNo}</bdi>
        </h1>
        <Space wrap>
          <PrintActions
            autoPrint={autoPrint}
            defaultPaper={printSettings.paperSize}
            fileName={docNo}
            renderDoc={(paper) => (
              <VoucherDocument
                voucher={v}
                paperSize={paper}
                lang={printSettings.language}
              />
            )}
          />
          {kind && (
            <Link
              href={`/accounts/statements?kind=${kind}&id=${v.customerId ?? v.supplierId}`}
            >
              <Button icon={<FileTextOutlined />}>{t("Statement")}</Button>
            </Link>
          )}
          {canCreate && (
            <Link href={`${VOUCHER_PATH[v.type]}/new`}>
              <Button icon={<PlusOutlined />}>{t(`new.${v.type}`)}</Button>
            </Link>
          )}
          <Link href={VOUCHER_PATH[v.type]}>
            <Button icon={<UnorderedListOutlined />}>
              {t(`list.${v.type}`)}
            </Button>
          </Link>
          {canDelete && (
            <Popconfirm
              title={t("DeleteVoucherConfirm")}
              onConfirm={remove}
              disabled={shiftClosed}
            >
              <Button
                danger
                icon={<DeleteOutlined />}
                loading={deleting}
                disabled={shiftClosed}
                title={shiftClosed ? tAlerts("VoucherShiftClosed") : undefined}
              />
            </Popconfirm>
          )}
        </Space>
      </div>

      <Card className="mb-4">
        <Descriptions
          bordered
          size="small"
          column={{ xs: 1, md: 2 }}
          items={items}
        />
      </Card>

      {v.allocations.length > 0 && (
        <Card title={t("AppliedTo")}>
          <Table
            size="small"
            bordered
            rowKey="id"
            pagination={false}
            dataSource={v.allocations}
            columns={[
              {
                title: t("Item"),
                key: "doc",
                render: (_, a) =>
                  a.sale ? (
                    <Link href={`/invoices/sales/${a.sale.id}`}>
                      {saleDocNo("sale", a.sale.number)}
                    </Link>
                  ) : a.purchase ? (
                    <Link href={`/invoices/purchases/${a.purchase.id}`}>
                      {formatDocNo("purchase", a.purchase.number)}
                    </Link>
                  ) : (
                    t("OpeningBalance")
                  ),
              },
              {
                title: t("Allocated"),
                dataIndex: "amount",
                align: "end",
                render: (x) => <b>{money(x)}</b>,
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Col,
  Empty,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
} from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { formatDateTime, formatDay } from "@/lib/dates";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useCan } from "@/components/auth/AuthProvider";
import DayPicker from "@/components/common/DayPicker";
import ExportButtons from "@/components/reports/ExportButtons";
import { C } from "@/lib/theme";

const KIND_COLOR = {
  invoice: "blue",
  return: "orange",
  receipt: "green",
  payment: "red",
  settlement: "purple",
  creditNote: "gold",
  debitNote: "cyan",
};

// ============================================================
// كشف حساب عميل/مورد: رصيد أول المدة، كل حركة والرصيد بعدها، رصيد آخر المدة
// الفلاتر في الرابط (?kind=&id=&from=&to=)
// ============================================================
export default function StatementView({
  kinds,
  kind,
  partyId,
  from,
  to,
  parties,
  statement,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Accounts");
  const can = useCan();
  const { amount: money } = useCurrency();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  const [filters, setFilters] = useState({ kind, id: partyId, from, to });

  const go = (f) => {
    const query = new URLSearchParams();
    query.set("kind", f.kind);
    if (f.id) query.set("id", String(f.id));
    if (f.from) query.set("from", f.from);
    if (f.to) query.set("to", f.to);
    router.push(`${pathname}?${query.toString()}`);
  };

  const debitTitle = t(`col.${kind}.debit`);
  const creditTitle = t(`col.${kind}.credit`);
  const lineLabel = (l) => t(`lineKind.${kind}.${l.kind}`);
  // اتجاه الرصيد بالكلام (موجب: على العميل / للمورد، سالب: رصيد للطرف أو لنا)
  const balanceSide = (v) =>
    Math.abs(v) < 0.005
      ? t("NoBalance")
      : v > 0
        ? t(kind === "customer" ? "CustomerOwes" : "WeOwe")
        : t(`creditBalance.${kind}`);

  const columns = [
    {
      title: t("Date"),
      key: "date",
      width: 140,
      align: "center",
      render: (_, l) => <bdi>{formatDateTime(l.date)}</bdi>,
    },
    {
      title: t("Movement"),
      key: "kind",
      width: 130,
      align: "center",
      render: (_, l) => <Tag color={KIND_COLOR[l.kind]}>{lineLabel(l)}</Tag>,
    },
    // الفرع اللي اتعملت منه الحركة
    {
      title: t("Branch"),
      key: "branch",
      width: 120,
      ellipsis: true,
      render: (_, l) => nameOf(l.branch),
    },
    {
      title: t("DocNo"),
      key: "doc",
      width: 100,
      align: "center",
      render: (_, l) => (
        <Link href={l.href}>
          <bdi>{l.docNo}</bdi>
        </Link>
      ),
    },
    {
      title: debitTitle,
      key: "debit",
      width: 120,
      align: "end",
      render: (_, l) => (l.debit ? money(l.debit) : ""),
    },
    {
      title: creditTitle,
      key: "credit",
      width: 120,
      align: "end",
      render: (_, l) => (l.credit ? money(l.credit) : ""),
    },
    {
      title: t("Balance"),
      key: "balance",
      width: 130,
      align: "end",
      render: (_, l) => <b>{money(l.balance)}</b>,
    },
    {
      title: t("Notes"),
      key: "notes",
      width: 200,
      ellipsis: true,
      render: (_, l) => l.notes,
    },
  ];

  const period =
    from || to
      ? `${from ? formatDay(from) : "…"} - ${to ? formatDay(to) : "…"}`
      : t("AllPeriods");

  const buildReport = () => {
    const p = statement.party;
    return {
      title: `${t(`statementOf.${kind}`)} - ${nameOf(p)}`,
      fileName: `${t(`statementOf.${kind}`)} ${p.code}`,
      info: [
        [
          t(kind === "customer" ? "Customer" : "Supplier"),
          `${p.code} - ${nameOf(p)}`,
        ],
        [t("Period"), period],
        ...(p.phone ? [[t("Phone"), p.phone]] : []),
        ...(p.taxNo ? [[t("TaxNo"), p.taxNo]] : []),
      ],
      summary: [
        [t("OpeningBalance"), money(statement.opening)],
        [debitTitle, money(statement.totalDebit)],
        [creditTitle, money(statement.totalCredit)],
        [
          `${t("ClosingBalance")} - ${balanceSide(statement.closing)}`,
          money(Math.abs(statement.closing)),
          true,
        ],
      ],
      columns: [
        { title: t("Date"), key: "date", type: "text", width: 18 },
        { title: t("Movement"), key: "kind", type: "text", width: 16 },
        { title: t("Branch"), key: "branch", type: "text", width: 14 },
        { title: t("DocNo"), key: "doc", type: "text", width: 12 },
        { title: debitTitle, key: "debit", type: "money" },
        { title: creditTitle, key: "credit", type: "money" },
        { title: t("Balance"), key: "balance", type: "money" },
        { title: t("Notes"), key: "notes", type: "text", width: 30 },
      ],
      rows: [
        {
          key: "opening",
          date: from ? formatDay(from) : "",
          kind: t("OpeningBalance"),
          balance: statement.opening,
        },
        ...statement.lines.map((l) => ({
          key: l.key,
          date: formatDateTime(l.date),
          kind: lineLabel(l),
          branch: nameOf(l.branch),
          doc: l.docNo,
          debit: l.debit || null,
          credit: l.credit || null,
          balance: l.balance,
          notes: l.notes ?? "",
        })),
      ],
      totals: {
        debit: statement.totalDebit,
        credit: statement.totalCredit,
        balance: statement.closing,
      },
      signatures: [t("Accountant"), t("Approved")],
    };
  };

  const newVoucherPath =
    kind === "customer" ? "/accounts/receipts/new" : "/accounts/payments/new";
  const canNewVoucher = can(
    kind === "customer" ? "receipts.create" : "paymentVouchers.create",
  );

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">{t("Statements")}</h1>
        {statement && (
          <Space wrap>
            {canNewVoucher &&
              (kind === "customer" || statement.closing > 0) && (
                <Link href={`${newVoucherPath}?${kind}=${partyId}`}>
                  <Button icon={<PlusOutlined />}>
                    {t(kind === "customer" ? "new.receipt" : "new.payment")}
                  </Button>
                </Link>
              )}
            <ExportButtons build={buildReport} />
          </Space>
        )}
      </div>

      <Card className="mb-4">
        <Space wrap align="end">
          {kinds.length > 1 && (
            <Segmented
              size="large"
              value={filters.kind}
              onChange={(v) => {
                const f = {
                  kind: v,
                  id: null,
                  from: filters.from,
                  to: filters.to,
                };
                setFilters(f);
                go(f);
              }}
              options={kinds.map((k) => ({
                value: k,
                label: t(
                  k === "customer"
                    ? "Customers"
                    : k === "supplier"
                      ? "Suppliers"
                      : "CombinedStatement",
                ),
              }))}
            />
          )}
          <Select
            showSearch
            size="large"
            style={{ width: 320 }}
            placeholder={t(
              kind === "customer" ? "ChooseCustomer" : "ChooseSupplier",
            )}
            value={filters.id ?? undefined}
            onChange={(v) => setFilters((f) => ({ ...f, id: v }))}
            options={parties.map((p) => ({
              value: p.id,
              label: `${p.code} - ${nameOf(p)}`,
              search:
                `${p.code} ${p.arName} ${p.enName} ${p.phone ?? ""}`.toLowerCase(),
            }))}
            filterOption={(input, o) => o.search.includes(input.toLowerCase())}
          />
          <div>
            <div className="text-gray-500 text-xs mb-1">{t("From")}</div>
            <DayPicker
              size="large"
              style={{ width: 160 }}
              allowClear
              value={filters.from}
              max={filters.to ?? undefined}
              onChange={(v) => setFilters((f) => ({ ...f, from: v ?? null }))}
            />
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-1">{t("To")}</div>
            <DayPicker
              size="large"
              style={{ width: 160 }}
              value={filters.to}
              min={filters.from ?? undefined}
              onChange={(v) => setFilters((f) => ({ ...f, to: v ?? null }))}
            />
          </div>
          <Button
            type="primary"
            size="large"
            icon={<SearchOutlined />}
            disabled={!filters.id}
            onClick={() => go(filters)}
          >
            {t("Show")}
          </Button>
        </Space>
      </Card>

      {!statement ? (
        <Empty
          description={t(
            kind === "customer" ? "ChooseCustomer" : "ChooseSupplier",
          )}
        />
      ) : (
        <>
          <Row gutter={[12, 12]} className="mb-4">
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title={t("OpeningBalance")}
                  value={money(statement.opening)}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title={debitTitle}
                  value={money(statement.totalDebit)}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title={creditTitle}
                  value={money(statement.totalCredit)}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title={`${t("ClosingBalance")} - ${balanceSide(statement.closing)}`}
                  value={money(Math.abs(statement.closing))}
                  styles={{
                    content: {
                      fontWeight: 800,
                      color: statement.closing > 0 ? C.dangerText : C.successText,
                    },
                  }}
                />
              </Card>
            </Col>
          </Row>
          <Table
            bordered
            size="small"
            rowKey="key"
            columns={columns}
            dataSource={statement.lines}
            pagination={statement.lines.length > 50 ? { pageSize: 50 } : false}
            scroll={{ x: columns.reduce((s, c) => s + c.width, 0) }}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4}>
                    <b>{t("Total")}</b>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="end">
                    <b>{money(statement.totalDebit)}</b>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="end">
                    <b>{money(statement.totalCredit)}</b>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="end">
                    <b>{money(statement.closing)}</b>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} />
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </>
      )}
    </div>
  );
}

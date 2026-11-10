"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
} from "antd";
import {
  LinkOutlined,
  QuestionCircleOutlined,
  SearchOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { formatDateTime, formatDay, today } from "@/lib/dates";
import {
  createOffsetAction,
  linkPartiesAction,
} from "@/actions/account.actions";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useSaveKey } from "@/components/common/useSaveKey";
import { useCurrency } from "@/components/common/CurrencyProvider";
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
  offset: "geekblue",
};

// ============================================================
// كشف حساب مشترك: عميل هو نفسه مورد
// - حركات العميل والمورد في جدول واحد بالتاريخ
// - مدين = يزوّد صافي اللي عليه لنا (فواتير البيع / سداد للمورد ...)
//   دائن = يقلّل صافي اللي عليه لنا (قبض منه / فواتير الشراء منه ...)
// - الرصيد الصافي: موجب = عليه لنا / سالب = له علينا
// - المقاصة: تقفل رصيده كعميل في رصيده كمورد (من غير فلوس)
// - الربط: بيتحفظ لما تعرض الكشف (المرة الجاية المورد بيتختار لوحده)
// الفلاتر في الرابط (?kind=combined&customer=&supplier=&from=&to=)
// ============================================================
export default function CombinedStatementView({
  kinds,
  customers,
  suppliers,
  links,
  customerId,
  supplierId,
  from,
  to,
  statement,
  canOffset,
  canOffsetDate,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Accounts");
  const tAlerts = useTranslations("Alerts");
  const { amount: money, symbol, decimals } = useCurrency();
  const saveKey = useSaveKey();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  const linkOf = new Map(links.map((l) => [l.id, l.supplierId]));
  const [filters, setFilters] = useState({
    customer: customerId,
    supplier: supplierId,
    from,
    to,
  });
  const [offsetOpen, setOffsetOpen] = useState(false);
  const [offset, setOffset] = useState({
    amount: null,
    date: today(),
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const go = (f) => {
    const query = new URLSearchParams();
    query.set("kind", "combined");
    if (f.customer) query.set("customer", String(f.customer));
    if (f.supplier) query.set("supplier", String(f.supplier));
    if (f.from) query.set("from", f.from);
    if (f.to) query.set("to", f.to);
    router.push(`${pathname}?${query.toString()}`);
  };

  // عرض الكشف: الربط بيتحفظ لو جديد
  const show = async () => {
    if (linkOf.get(filters.customer) !== filters.supplier) {
      const res = await linkPartiesAction({
        customerId: filters.customer,
        supplierId: filters.supplier,
      });
      if (!res.success) return showActionError(res, tAlerts, locale);
    }
    go(filters);
  };

  const balanceSide = (v) =>
    Math.abs(v) < 0.005
      ? t("NoBalance")
      : v > 0
        ? t("CombinedOwesUs")
        : t("CombinedWeOwe");

  const sideLabel = (l) =>
    l.side === "customer" ? t("AsCustomer") : t("AsSupplier");
  const lineLabel = (l) => t(`lineKind.${l.side}.${l.kind}`);

  const columns = [
    {
      title: t("Date"),
      key: "date",
      width: 140,
      align: "center",
      render: (_, l) => <bdi>{formatDateTime(l.date)}</bdi>,
    },
    {
      title: t("Side"),
      key: "side",
      width: 90,
      align: "center",
      render: (_, l) => <Tag className="cp-chip">{sideLabel(l)}</Tag>,
    },
    {
      title: t("Movement"),
      key: "kind",
      width: 140,
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
      title: t("col.combined.debit"),
      key: "debit",
      width: 120,
      align: "end",
      render: (_, l) => (l.debit ? money(l.debit) : ""),
    },
    {
      title: t("col.combined.credit"),
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

  const buildReport = () => ({
    title: `${t("CombinedStatement")} - ${nameOf(statement.customer)}`,
    fileName: `${t("CombinedStatement")} ${statement.customer.code}`,
    info: [
      [
        t("Customer"),
        `${statement.customer.code} - ${nameOf(statement.customer)}`,
      ],
      [
        t("Supplier"),
        `${statement.supplier.code} - ${nameOf(statement.supplier)}`,
      ],
      [t("Period"), period],
    ],
    summary: [
      [t("OpeningBalance"), money(statement.opening)],
      [t("col.combined.debit"), money(statement.totalDebit)],
      [t("col.combined.credit"), money(statement.totalCredit)],
      [
        `${t("ClosingBalance")} - ${balanceSide(statement.closing)}`,
        money(Math.abs(statement.closing)),
        true,
      ],
    ],
    columns: [
      { title: t("Date"), key: "date", type: "text", width: 18 },
      { title: t("Side"), key: "side", type: "text", width: 10 },
      { title: t("Movement"), key: "kind", type: "text", width: 16 },
      { title: t("Branch"), key: "branch", type: "text", width: 14 },
      { title: t("DocNo"), key: "doc", type: "text", width: 12 },
      { title: t("col.combined.debit"), key: "debit", type: "money" },
      { title: t("col.combined.credit"), key: "credit", type: "money" },
      { title: t("Balance"), key: "balance", type: "money" },
      { title: t("Notes"), key: "notes", type: "text", width: 26 },
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
        side: sideLabel(l),
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
  });

  // المقاصة: أقصى مبلغ = الأقل من (اللي عليه كعميل، واللي ليه كمورد)
  const maxOffset = statement
    ? Math.max(
        0,
        Math.min(statement.customerBalance, statement.supplierBalance),
      )
    : 0;

  const openOffset = () => {
    setOffset({ amount: maxOffset, date: today(), notes: "" });
    setOffsetOpen(true);
  };

  const saveOffset = async () => {
    if (!(offset.amount > 0)) return message.error(t("AmountRequired"));
    if (offset.amount > maxOffset + 0.0001)
      return message.error(tAlerts("OffsetExceedsBalance"));
    setSaving(true);
    const res = await saveKey.send(createOffsetAction, {
      customerId,
      supplierId,
      amount: offset.amount,
      date: canOffsetDate ? offset.date : undefined,
      notes: offset.notes,
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("OffsetSaved"));
    setOffsetOpen(false);
    router.refresh();
  };

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">{t("Statements")}</h1>
        {statement && (
          <Space wrap>
            {canOffset && (
              <Tooltip
                title={maxOffset > 0 ? t("OffsetHint") : t("OffsetNothing")}
              >
                <Button
                  icon={<SwapOutlined />}
                  disabled={!(maxOffset > 0)}
                  onClick={openOffset}
                >
                  {t("Offset")}
                </Button>
              </Tooltip>
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
              value="combined"
              onChange={(v) => {
                if (v === "combined") return;
                const query = new URLSearchParams({ kind: v });
                router.push(`${pathname}?${query.toString()}`);
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
          <div>
            <div className="text-gray-500 text-xs mb-1">{t("Customer")}</div>
            <Select
              showSearch
              size="large"
              style={{ width: 260 }}
              placeholder={t("ChooseCustomer")}
              value={filters.customer ?? undefined}
              // العميل المربوط بمورد: المورد بيتختار لوحده
              onChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  customer: v,
                  supplier: linkOf.get(v) ?? f.supplier,
                }))
              }
              options={customers.map((p) => ({
                value: p.id,
                label: `${p.code} - ${nameOf(p)}${linkOf.has(p.id) ? " 🔗" : ""}`,
                search:
                  `${p.code} ${p.arName} ${p.enName} ${p.phone ?? ""}`.toLowerCase(),
              }))}
              filterOption={(input, o) =>
                o.search.includes(input.toLowerCase())
              }
            />
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-1">
              {t("Supplier")}{" "}
              <Tooltip title={t("LinkHint")}>
                <QuestionCircleOutlined />
              </Tooltip>
            </div>
            <Select
              showSearch
              size="large"
              style={{ width: 260 }}
              placeholder={t("ChooseSupplier")}
              value={filters.supplier ?? undefined}
              onChange={(v) => setFilters((f) => ({ ...f, supplier: v }))}
              options={suppliers.map((p) => ({
                value: p.id,
                label: `${p.code} - ${nameOf(p)}`,
                search:
                  `${p.code} ${p.arName} ${p.enName} ${p.phone ?? ""}`.toLowerCase(),
              }))}
              filterOption={(input, o) =>
                o.search.includes(input.toLowerCase())
              }
            />
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-1">{t("From")}</div>
            <DayPicker
              size="large"
              style={{ width: 150 }}
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
              style={{ width: 150 }}
              value={filters.to}
              min={filters.from ?? undefined}
              onChange={(v) => setFilters((f) => ({ ...f, to: v ?? null }))}
            />
          </div>
          <Button
            type="primary"
            size="large"
            icon={<SearchOutlined />}
            disabled={!filters.customer || !filters.supplier}
            onClick={show}
          >
            {t("Show")}
          </Button>
        </Space>
        {statement && (
          <div className="mt-2 text-gray-500">
            <LinkOutlined /> {t("LinkedNote")}
          </div>
        )}
      </Card>

      {!statement ? (
        <Empty description={t("CombinedChoose")} />
      ) : (
        <>
          <Row gutter={[12, 12]} className="mb-4">
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title={`${t("AsCustomer")} - ${
                    statement.customerBalance >= 0
                      ? t("CustomerOwes")
                      : t("creditBalance.customer")
                  }`}
                  value={money(Math.abs(statement.customerBalance))}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title={`${t("AsSupplier")} - ${
                    statement.supplierBalance >= 0
                      ? t("WeOwe")
                      : t("creditBalance.supplier")
                  }`}
                  value={money(Math.abs(statement.supplierBalance))}
                />
              </Card>
            </Col>
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
                  title={`${t("NetBalance")} - ${balanceSide(statement.closing)}`}
                  value={money(Math.abs(statement.closing))}
                  styles={{
                    content: {
                      fontWeight: 800,
                      color:
                        statement.closing > 0 ? C.dangerText : C.successText,
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
                  <Table.Summary.Cell index={0} colSpan={5}>
                    <b>{t("Total")}</b>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="end">
                    <b>{money(statement.totalDebit)}</b>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="end">
                    <b>{money(statement.totalCredit)}</b>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="end">
                    <b>{money(statement.closing)}</b>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={8} />
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </>
      )}

      {/* سند المقاصة */}
      <Modal
        open={offsetOpen}
        onCancel={() => setOffsetOpen(false)}
        title={t("Offset")}
        okText={t("SaveOffset")}
        onOk={saveOffset}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          className="mb-3"
          title={t("OffsetExplain", { max: `${money(maxOffset)} ${symbol}` })}
        />
        <Row gutter={[12, 12]}>
          <Col xs={24} md={12}>
            <div className="mb-1">{t("Amount")}</div>
            <InputNumber
              style={{ width: "100%" }}
              min={0}
              max={maxOffset}
              precision={decimals}
              value={offset.amount}
              onChange={(v) => setOffset((o) => ({ ...o, amount: v }))}
            />
          </Col>
          <Col xs={24} md={12}>
            <div className="mb-1">{t("Date")}</div>
            <DayPicker
              disabled={!canOffsetDate}
              max={today()}
              value={offset.date}
              onChange={(v) => setOffset((o) => ({ ...o, date: v ?? today() }))}
            />
          </Col>
          <Col xs={24}>
            <div className="mb-1">{t("Notes")}</div>
            <Input
              maxLength={500}
              value={offset.notes}
              onChange={(e) =>
                setOffset((o) => ({ ...o, notes: e.target.value }))
              }
            />
          </Col>
        </Row>
      </Modal>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Popconfirm,
  Row,
  Space,
  Table,
  Tag,
} from "antd";
import NextDocNo from "@/components/common/NextDocNo";
import DayPicker from "@/components/common/DayPicker";
import { LockOutlined } from "@ant-design/icons";
import { dayOf, today } from "@/lib/dates";
import { message } from "@/components/common/feedback";
import {
  ClearOutlined,
  CheckSquareOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { showActionError } from "@/components/common/actionError";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { calcReturnLine, round, totalsOf } from "@/lib/invoice-calc";
import { formatDateTime } from "@/lib/dates";
import {
  createSaleReturnAction,
  findSalesForReturnAction,
  getSaleForReturnAction,
} from "@/actions/sale.actions";
import { useSaveKey } from "@/components/common/useSaveKey";
import { useCurrency } from "@/components/common/CurrencyProvider";
import PaymentsEditor from "@/components/purchases/PaymentsEditor";
import TotalsSummary from "@/components/purchases/TotalsSummary";
import SearchBox from "@/components/common/SearchBox";
import { LineNoteText } from "@/components/purchases/LineNote";
import "@/components/purchases/purchases.css";
import { saleDocNo } from "@/lib/doc-number";
import PreviewBeforeSave from "@/components/printing/PreviewBeforeSave";
import SavePrintButtons from "@/components/printing/SavePrintButtons";
import { printQuery } from "@/lib/print-param";
import { previewPayments, previewTotals } from "@/lib/preview-doc";
import { showZatcaResult } from "@/components/zatca/zatcaUi";
import ScanSafeNumber from "@/components/common/ScanSafeNumber";

// مبالغ السطر الأصلي بالأسماء التي يستخدمها الحساب
const originalAmounts = (l) => ({
  qty: l.qty,
  price: l.price,
  itemDiscount: l.itemDiscount,
  invoiceDiscount: l.invoiceDiscount,
  net: l.netAmount,
  tax: l.taxAmount,
  total: l.totalAmount,
});

// ============================================================
// مرتجع مبيعات: لازم يكون من فاتورة بيع (بدون حد للمدة)
// 1) نبحث عن الفاتورة برقمها (أو نمسح باركود رقمها)
// 2) نعلّم على الأصناف المرتجعة (أو "إرجاع الفاتورة بالكامل")
// 3) المبالغ من الفاتورة الأصلية (بنفس السعر والخصم والضريبة)
// 4) رد المبلغ: نقدي/شبكة...، أو لحساب العميل (العميل النقدي: رد كامل)
// initialPurchase: الفاتورة لو فُتحت من صفحتها (?sale=ID)
// ============================================================
export default function SaleReturnForm({
  methods,
  creditMethod,
  initialPurchase,
  shift,
  canChangeDate = false,
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Purchases");
  const tZ = useTranslations("Zatca");
  const tS = useTranslations("Sales");
  const tAlerts = useTranslations("Alerts");
  const { amount: money, decimals } = useCurrency();
  // بصمة الحفظ: الضغط على حفظ مرتين (أو بعد ما الرد يضيع) مايكررش المستند
  const saveKey = useSaveKey();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  // البحث عن الفاتورة
  const [lookup, setLookup] = useState("");
  const [finding, setFinding] = useState(false);
  const [candidates, setCandidates] = useState([]);

  // الفاتورة المختارة والأصناف المرتجعة { itemId: qty }
  const [purchase, setPurchase] = useState(initialPurchase ?? null);
  const [selected, setSelected] = useState({});
  const [filter, setFilter] = useState("");

  const [notes, setNotes] = useState("");
  // التاريخ: اليوم، وتغييره بصلاحية (ولا يسبق تاريخ الفاتورة)
  const todayDay = today();
  const [date, setDate] = useState(todayDay);
  // null = لم يختر طريقة الدفع بعد، [] = آجل بالكامل
  const [payments, setPayments] = useState(null);
  const [saving, setSaving] = useState(null);

  const reset = (p) => {
    setPurchase(p);
    setSelected({});
    setFilter("");
    setPayments(null);
    setCandidates([]);
    setDate(todayDay);
  };

  // مسح كل شيء (الفاتورة المختارة والأصناف والمدفوعات) والبدء من جديد
  const resetAll = () => {
    reset(null);
    setLookup("");
    setNotes("");
  };

  // ---------- البحث ----------
  const loadPurchase = async (id) => {
    setFinding(true);
    const res = await getSaleForReturnAction(id);
    setFinding(false);
    if (!res.success) return message.error(tAlerts(res.error));
    if (!res.data) return message.error(tAlerts("SaleNotFound"));
    reset(res.data);
  };

  const find = async () => {
    const value = lookup.trim();
    if (!value) return;
    setFinding(true);
    const res = await findSalesForReturnAction({ value });
    setFinding(false);
    if (!res.success) return message.error(tAlerts(res.error));
    if (!res.data.length) {
      setCandidates([]);
      return message.warning(tS("SaleNotFoundFor", { q: value }));
    }
    if (res.data.length === 1) return loadPurchase(res.data[0].id);
    setPurchase(null);
    setCandidates(res.data);
  };

  // ---------- الاختيار ----------
  const items = useMemo(() => purchase?.items ?? [], [purchase]);
  const selectable = items.filter((l) => l.available > 0);

  const select = (ids) => {
    setSelected((prev) => {
      const next = {};
      for (const id of ids) {
        const line = items.find((l) => l.id === id);
        // الصنف الجديد يأخذ كل المتاح، والمختار من قبل يحتفظ بكميته
        next[id] = prev[id] ?? line.available;
      }
      return next;
    });
  };

  const selectAll = () =>
    setSelected(Object.fromEntries(selectable.map((l) => [l.id, l.available])));

  // البحث داخل أصناف الفاتورة (اسم أو كود)، و Enter بالكود ← يعلّم عليه
  const q = filter.trim().toLowerCase();
  const visible = q
    ? items.filter(
        (l) =>
          l.code.toLowerCase().includes(q) ||
          l.arName.toLowerCase().includes(q) ||
          l.enName.toLowerCase().includes(q),
      )
    : items;

  const onFilterEnter = () => {
    const line = items.find((l) => l.code.toLowerCase() === q);
    if (!line) return;
    if (line.available <= 0) return message.warning(t("FullyReturnedItem"));
    setSelected((prev) => ({
      ...prev,
      [line.id]: prev[line.id] ?? line.available,
    }));
    setFilter("");
  };

  // ---------- الحساب ----------
  const lines = useMemo(
    () =>
      items
        .filter((l) => selected[l.id] > 0)
        .map((l) => ({
          id: l.id,
          ...calcReturnLine(
            originalAmounts(l),
            l.returned,
            selected[l.id],
            decimals,
          ),
        })),
    [items, selected, decimals],
  );
  const amountById = new Map(lines.map((l) => [l.id, l]));
  const totals = totalsOf(lines, decimals);

  // ---------- معاينة قبل الحفظ (إشعار دائن) ----------
  const buildPreview = (ctx) => {
    if (!purchase || !lines.length) return null;
    const docItems = lines.map((l) => {
      const o = items.find((x) => x.id === l.id) ?? {};
      return {
        id: l.id,
        code: o.code,
        arName: o.arName,
        enName: o.enName,
        note: o.note ?? null,
        unit: o.unit,
        qty: l.qty,
        price: Number(o.price) || 0,
        priceIncludesTax: o.priceIncludesTax,
        itemDiscount: l.itemDiscount,
        invoiceDiscount: l.invoiceDiscount,
        taxRate: o.taxRate,
        netAmount: l.net,
        taxAmount: l.tax,
        totalAmount: l.total,
      };
    });
    return {
      preview: true,
      type: "return",
      number: ctx.number,
      date: date && date !== todayDay ? date : new Date().toISOString(),
      branch: ctx.branch,
      createdBy: ctx.user,
      returnOf: { id: purchase.id, number: purchase.number },
      customer: purchase.customer ?? null,
      customerArName: purchase.customerArName,
      customerEnName: purchase.customerEnName,
      customerTaxNo: purchase.customerTaxNo,
      notes,
      items: docItems,
      ...previewTotals(totals),
      ...previewPayments(
        payments,
        [...methods, creditMethod].filter(Boolean),
        totals.total,
      ),
      changeAmount: 0,
      tenderedAmount: 0,
      zatcaDocument: null,
    };
  };

  // ---------- الحفظ ----------
  const save = async (mode) => {
    const chosen = Object.entries(selected).map(([id, qty]) => ({
      itemId: Number(id),
      qty: Number(qty),
    }));
    if (!chosen.length) return message.error(t("ChooseItemsToReturn"));
    if (chosen.some((c) => !(c.qty > 0)))
      return message.error(t("QtyRequired"));
    for (const c of chosen) {
      const line = items.find((l) => l.id === c.itemId);
      if (c.qty > line.available)
        return message.error(tAlerts("ReturnQtyExceeded"));
    }
    if (payments === null) return message.error(t("ChoosePaymentMethod"));
    if (payments.some((p) => !(p.amount > 0)))
      return message.error(t("PaymentAmountRequired"));
    const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    if (round(paid, decimals) > totals.total)
      return message.error(t("PaidExceedsTotal"));
    if (round(paid, decimals) < totals.total && !purchase.customerId)
      return message.error(tAlerts("CashCustomerFullRefund"));

    setSaving(mode);
    const res = await saveKey.send(createSaleReturnAction, {
      saleId: purchase.id,
      date: canChangeDate ? date : undefined,
      notes,
      items: chosen,
      payments: payments.map((p) => ({
        paymentMethodId: p.paymentMethodId,
        amount: Number(p.amount),
        reference: p.reference,
      })),
    });

    if (!res.success) {
      setSaving(null);
      showActionError(res, tAlerts, locale);
      // الكميات تغيرت (مرتجع آخر في نفس الوقت): نعيد تحميل الفاتورة
      if (res.error === "ReturnQtyExceeded") loadPurchase(purchase.id);
      return;
    }

    message.success(
      tS("ReturnSaved", {
        number: saleDocNo("return", res.data.number),
      }),
    );
    showZatcaResult(res.data.zatca, { t: tZ });
    router.push(`/invoices/sales-returns/${res.data.id}${printQuery(mode)}`);
    // الشاشة ترجع فاضية لمرتجع جديد
    resetAll();
    setSaving(null);
  };

  // ---------- الجدول ----------
  const columns = [
    {
      title: t("Item"),
      key: "name",
      width: 230,
      render: (_, l) => (
        <div>
          <div className="pur-line__name">{nameOf(l)}</div>
          <div className="pur-line__code">
            <bdi>{l.code}</bdi>
          </div>
          <LineNoteText note={l.note} />
        </div>
      ),
    },
    {
      title: t("Unit"),
      key: "unit",
      width: 90,
      render: (_, l) => nameOf(l.unit),
    },
    {
      title: tS("Sold"),
      dataIndex: "qty",
      key: "qty",
      width: 85,
      align: "center",
    },
    {
      title: t("ReturnedBefore"),
      key: "returnedQty",
      width: 95,
      align: "center",
      render: (_, l) => (l.returnedQty > 0 ? l.returnedQty : "—"),
    },
    {
      title: t("Available"),
      key: "available",
      width: 90,
      align: "center",
      render: (_, l) =>
        l.available > 0 ? (
          <b>{l.available}</b>
        ) : (
          <Tag color="red">{t("FullyReturned")}</Tag>
        ),
    },
    {
      title: t("ReturnQty"),
      key: "returnQty",
      width: 110,
      render: (_, l) =>
        l.available > 0 ? (
          <ScanSafeNumber
            field="qty"
            size="small"
            style={{ width: "100%" }}
            min={0}
            max={l.available}
            precision={3}
            controls={false}
            disabled={selected[l.id] == null}
            value={selected[l.id]}
            formatter={(v) => (v === "" || v == null ? "" : String(Number(v)))}
            onChange={(v) =>
              setSelected((prev) => ({
                ...prev,
                [l.id]: Math.min(v ?? 0, l.available),
              }))
            }
          />
        ) : null,
    },
    {
      title: t("Price"),
      key: "price",
      width: 95,
      align: "end",
      render: (_, l) => money(l.price),
    },
    {
      title: t("ReturnAmount"),
      key: "amount",
      width: 110,
      align: "end",
      render: (_, l) => {
        const a = amountById.get(l.id);
        return a ? <b>{money(a.total)}</b> : "—";
      },
    },
  ];
  const TABLE_WIDTH = columns.reduce((s, c) => s + c.width, 0) + 40;

  return (
    <div className="pur">
      <h1 className="font-bold text-xl mb-4 flex flex-wrap items-center gap-3">
        {tS("NewReturn")} <NextDocNo type="saleReturn" />
      </h1>
      {shift && (
        <Alert
          className="mb-3"
          type="info"
          showIcon
          title={tS("RefundFromShift")}
        />
      )}

      {/* ============ البحث عن فاتورة الشراء ============ */}
      <Card size="small" className="mb-3">
        <Space wrap>
          <SearchBox
            width={380}
            dir="ltr"
            allowClear={false}
            value={lookup}
            onChange={setLookup}
            onSearch={find}
            loading={finding}
            buttonText={t("ShowInvoice")}
            placeholder="SI-15"
          />
        </Space>

        {candidates.length > 1 && (
          <div className="mt-3">
            <Alert
              type="info"
              showIcon
              className="mb-2"
              title={t("ManyInvoicesFound")}
            />
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={candidates}
              onRow={(r) => ({
                onClick: () => loadPurchase(r.id),
                style: { cursor: "pointer" },
              })}
              columns={[
                {
                  title: tS("SaleNo"),
                  key: "number",
                  width: 110,
                  render: (_, r) => saleDocNo("sale", r.number),
                },
                {
                  title: tS("Customer"),
                  render: (_, r) =>
                    (locale === "ar" ? r.customerArName : r.customerEnName) ||
                    tS("CashCustomer"),
                },
                {
                  title: tS("Date"),
                  render: (_, r) => formatDateTime(r.date),
                },
                { title: t("Total"), render: (_, r) => money(r.totalAmount) },
              ]}
            />
          </div>
        )}
      </Card>

      {!purchase && !candidates.length && (
        <Empty description={t("FindInvoiceFirst")} className="my-10" />
      )}

      {purchase && (
        <>
          {/* ============ بيانات الفاتورة ============ */}
          <Card size="small" className="mb-3">
            <div className="pur-info">
              <div>
                <span>{tS("SaleNo")}</span>
                <Link href={`/invoices/sales/${purchase.id}`}>
                  {saleDocNo("sale", purchase.number)}
                </Link>
              </div>
              <div>
                <span>{tS("Customer")}</span>
                <span>
                  {(locale === "ar"
                    ? purchase.customerArName
                    : purchase.customerEnName) || tS("CashCustomer")}
                </span>
              </div>
              <div>
                <span>{tS("Date")}</span>
                <bdi>{formatDateTime(purchase.date)}</bdi>
              </div>
              <div>
                <span>{t("Total")}</span>
                <span>{money(purchase.totalAmount)}</span>
              </div>
            </div>
          </Card>

          {/* ============ الأصناف ============ */}
          <Card size="small" className="mb-3">
            {!selectable.length && (
              <Alert
                type="warning"
                showIcon
                className="mb-3"
                title={t("InvoiceFullyReturned")}
              />
            )}
            <Space wrap className="mb-3">
              <SearchBox
                width={340}
                placeholder={t("FilterItems")}
                value={filter}
                onChange={setFilter}
                onSearch={onFilterEnter}
              />
              <Button
                icon={<CheckSquareOutlined />}
                onClick={selectAll}
                disabled={!selectable.length}
              >
                {t("ReturnWholeInvoice")}
              </Button>
              {Object.keys(selected).length > 0 && (
                <Button type="text" danger onClick={() => setSelected({})}>
                  {t("ClearSelection")}
                </Button>
              )}
            </Space>

            <Table
              size="small"
              bordered
              rowKey="id"
              columns={columns}
              dataSource={visible}
              pagination={false}
              tableLayout="fixed"
              scroll={{ x: TABLE_WIDTH, y: 420 }}
              rowClassName={(l) => (l.available <= 0 ? "pur-row--done" : "")}
              rowSelection={{
                selectedRowKeys: Object.keys(selected).map(Number),
                getCheckboxProps: (l) => ({ disabled: l.available <= 0 }),
                onChange: (keys) => {
                  // الصفوف المخفية بالبحث تبقى كما هي
                  const hidden = Object.keys(selected)
                    .map(Number)
                    .filter((id) => !visible.some((l) => l.id === id));
                  select([...new Set([...hidden, ...keys])]);
                },
              }}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={columns.length}>
                      {t("SelectedSummary", { count: lines.length })}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="end">
                      <b>{money(totals.total)}</b>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </Card>

          {/* ============ التاريخ والمدفوعات والإجماليات ============ */}
          <Row gutter={[12, 12]}>
            <Col xs={24} lg={14}>
              <Card size="small" className="mb-3">
                <Row gutter={[12, 12]}>
                  <Col xs={24} md={8}>
                    <div className="mb-1">
                      {t("ReturnDate")} {!canChangeDate && <LockOutlined />}
                    </div>
                    <DayPicker
                      disabled={!canChangeDate}
                      min={dayOf(purchase.date)}
                      max={todayDay}
                      value={date}
                      onChange={(day) => setDate(day || todayDay)}
                    />
                  </Col>
                  <Col xs={24} md={16}>
                    <div className="mb-1">{t("Notes")}</div>
                    <Input
                      maxLength={500}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </Col>
                </Row>
              </Card>
              <Card size="small" title={t("RefundPayments")}>
                <PaymentsEditor
                  methods={methods}
                  creditMethod={creditMethod}
                  allowCredit={Boolean(purchase.customerId)}
                  total={totals.total}
                  value={payments}
                  onChange={setPayments}
                  creditLabel={tS("ToCustomerAccount")}
                />
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card size="small" title={t("Totals")} className="mb-3">
                <TotalsSummary totals={totals} taxMode="exclusive" />
              </Card>
              <Space wrap>
                <PreviewBeforeSave kind="return" buildDoc={buildPreview} />
                <Button
                  type="primary"
                  size="large"
                  icon={<SaveOutlined />}
                  loading={saving === "save"}
                  disabled={Boolean(saving) || !lines.length}
                  onClick={() => save("save")}
                >
                  {t("SaveReturn")}
                </Button>
                <SavePrintButtons
                  onSave={save}
                  saving={saving}
                  disabled={!lines.length}
                />
                <Popconfirm
                  title={t("ResetTitle")}
                  description={t("ResetWarning")}
                  okText={t("ResetConfirm")}
                  okButtonProps={{ danger: true }}
                  cancelText={t("Cancel")}
                  onConfirm={resetAll}
                >
                  <Button
                    size="large"
                    danger
                    icon={<ClearOutlined />}
                    disabled={Boolean(saving)}
                  >
                    {t("Reset")}
                  </Button>
                </Popconfirm>
              </Space>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

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
  Segmented,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import NextDocNo from "@/components/common/NextDocNo";
import { message } from "@/components/common/feedback";
import {
  ClearOutlined,
  CheckSquareOutlined,
  LockOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { showActionError } from "@/components/common/actionError";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { calcReturnLine, round, totalsOf } from "@/lib/invoice-calc";
import { dayOf, formatDateTime, formatDay, today } from "@/lib/dates";
import {
  createPurchaseReturnAction,
  findPurchasesForReturnAction,
  getPurchaseForReturnAction,
} from "@/actions/purchase.actions";
import { useSaveKey } from "@/components/common/useSaveKey";
import { useCurrency } from "@/components/common/CurrencyProvider";
import PaymentsEditor from "./PaymentsEditor";
import TotalsSummary from "./TotalsSummary";
import SearchBox from "@/components/common/SearchBox";
import { LineNoteText } from "./LineNote";
import "./purchases.css";
import DayPicker from "@/components/common/DayPicker";
import PreviewBeforeSave from "@/components/printing/PreviewBeforeSave";
import SavePrintButtons from "@/components/printing/SavePrintButtons";
import SavedDocPrint from "@/components/printing/SavedDocPrint";
import { previewPayments, previewTotals } from "@/lib/preview-doc";
import { formatDocNo } from "@/lib/doc-number";
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
// مرتجع مشتريات: لازم يكون من فاتورة شراء
// 1) نبحث عن الفاتورة برقمنا أو برقم فاتورة المورد
// 2) نعلّم على الأصناف المرتجعة (أو "إرجاع الفاتورة بالكامل")
//    - كمية الإرجاع لا تتجاوز المتاح، والمرتجع بالكامل يظهر معطّلاً
// 3) المبالغ من الفاتورة الأصلية (بنفس الخصم والضريبة)
// initialPurchase: لو فُتحت من صفحة الفاتورة (?purchase=ID)
// ============================================================
export default function PurchaseReturnForm({
  methods,
  creditMethod,
  canChangeDate,
  initialPurchase,
}) {
  const locale = useLocale();
  // بعد حفظ مستند جديد: شريط "تم الحفظ" + الطباعة في نفس الشاشة
  const [printJob, setPrintJob] = useState(null);
  const t = useTranslations("Purchases");
  const tTax = useTranslations("TaxModes");
  const tAlerts = useTranslations("Alerts");
  const tSerial = useTranslations("Serials");
  const { amount: money, decimals } = useCurrency();
  // بصمة الحفظ: الضغط على حفظ مرتين (أو بعد ما الرد يضيع) مايكررش المستند
  const saveKey = useSaveKey();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  // البحث عن الفاتورة
  const [by, setBy] = useState("number");
  const [lookup, setLookup] = useState("");
  const [finding, setFinding] = useState(false);
  const [candidates, setCandidates] = useState([]);

  // الفاتورة المختارة والأصناف المرتجعة { itemId: qty }
  const [purchase, setPurchase] = useState(initialPurchase ?? null);
  const [selected, setSelected] = useState({});
  // الأرقام التسلسلية الراجعة للمورد { itemId: [serialId] } (اختياري)
  const [serialPick, setSerialPick] = useState({});
  const [filter, setFilter] = useState("");

  const todayDay = today();
  const [date, setDate] = useState(todayDay);
  const [supplierNoteNo, setSupplierNoteNo] = useState("");
  const [notes, setNotes] = useState("");
  // null = لم يختر طريقة الدفع بعد، [] = آجل بالكامل
  const [payments, setPayments] = useState(null);
  const [saving, setSaving] = useState(null);

  const minDay = purchase ? dayOf(purchase.date) : undefined;

  const reset = (p) => {
    setPurchase(p);
    setSelected({});
    setSerialPick({});
    setFilter("");
    setPayments(null);
    setCandidates([]);
    setDate(todayDay);
  };

  // مسح كل شيء (الفاتورة المختارة والأصناف والمدفوعات) والبدء من جديد
  const resetAll = () => {
    reset(null);
    setLookup("");
    setSupplierNoteNo("");
    setNotes("");
  };

  // ---------- البحث ----------
  const loadPurchase = async (id) => {
    setFinding(true);
    const res = await getPurchaseForReturnAction(id);
    setFinding(false);
    if (!res.success) return message.error(tAlerts(res.error));
    if (!res.data) return message.error(tAlerts("PurchaseNotFound"));
    reset(res.data);
  };

  const find = async () => {
    const value = lookup.trim();
    if (!value) return;
    setFinding(true);
    const res = await findPurchasesForReturnAction({ by, value });
    setFinding(false);
    if (!res.success) return message.error(tAlerts(res.error));
    if (!res.data.length) {
      setCandidates([]);
      return message.warning(t("PurchaseNotFoundFor", { q: value }));
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

  // ---------- الأرقام التسلسلية ----------
  const hasSerials = items.some((l) => l.stockSerials?.length);
  const pickSerials = (line, ids) => {
    setSerialPick((prev) => ({ ...prev, [line.id]: ids }));
    if (ids.length) {
      const factor = Number(line.factor) || 1;
      setSelected((prev) => ({
        ...prev,
        [line.id]: Math.min(
          Math.round((ids.length / factor) * 1000) / 1000,
          line.available,
        ),
      }));
    }
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

  // ---------- معاينة قبل الحفظ ----------
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
      supplierArName: purchase.supplierArName,
      supplierEnName: purchase.supplierEnName,
      supplierTaxNo: purchase.supplierTaxNo,
      supplierInvoiceNo: purchase.supplierInvoiceNo,
      supplierInvoiceDate: purchase.supplierInvoiceDate,
      taxMode: purchase.taxMode,
      notes,
      items: docItems,
      ...previewTotals(totals),
      ...previewPayments(
        payments,
        [...methods, creditMethod].filter(Boolean),
        totals.total,
      ),
    };
  };

  // ---------- الحفظ ----------
  const save = async (mode) => {
    const chosen = Object.entries(selected).map(([id, qty]) => ({
      itemId: Number(id),
      qty: Number(qty),
      serialIds: serialPick[id] ?? [],
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
    if (date < minDay || date > todayDay)
      return message.error(tAlerts("DateBeforeOriginal"));

    setSaving(mode);
    const res = await saveKey.send(createPurchaseReturnAction, {
      purchaseId: purchase.id,
      date: canChangeDate ? date : undefined,
      supplierInvoiceNo: supplierNoteNo,
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

    // الشاشة بتفضل فاضية لمرتجع جديد (الطباعة من نفس الشاشة)
    setPrintJob({
      kind: "purchaseReturn",
      id: res.data.id,
      mode: mode,
      text: t("ReturnSaved", {
        number: formatDocNo("return", res.data.number),
      }),
      seq: Date.now(),
    });
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
      title: t("Purchased"),
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
    // الأرقام التسلسلية (لو الفاتورة فيها قطع مسجلة لسه في المحل)
    ...(hasSerials
      ? [
          {
            title: tSerial("ReturnedSerials"),
            key: "serials",
            width: 230,
            render: (_, l) =>
              l.stockSerials?.length && l.available > 0 ? (
                <Select
                  mode="multiple"
                  size="small"
                  style={{ width: "100%" }}
                  placeholder={tSerial("ChooseSerials")}
                  disabled={selected[l.id] == null}
                  value={serialPick[l.id] ?? []}
                  optionFilterProp="label"
                  onChange={(ids) => pickSerials(l, ids)}
                  options={l.stockSerials.map((x) => ({
                    value: x.id,
                    label: x.serial2 ? `${x.serial} / ${x.serial2}` : x.serial,
                  }))}
                />
              ) : null,
          },
        ]
      : []),
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
      <SavedDocPrint job={printJob} onClose={() => setPrintJob(null)} />
      <h1 className="font-bold text-xl mb-4 flex flex-wrap items-center gap-3">
        {t("NewReturn")} <NextDocNo type="purchaseReturn" />
      </h1>

      {/* ============ البحث عن فاتورة الشراء ============ */}
      <Card size="small" className="mb-3">
        <Space wrap>
          <Segmented
            value={by}
            onChange={setBy}
            options={[
              { value: "number", label: t("ByOurNumber") },
              { value: "supplierInvoiceNo", label: t("BySupplierInvoiceNo") },
            ]}
          />
          <SearchBox
            width={380}
            dir="ltr"
            allowClear={false}
            value={lookup}
            onChange={setLookup}
            onSearch={find}
            loading={finding}
            buttonText={t("ShowInvoice")}
            placeholder={by === "number" ? "PI-15" : "INV-2024-001"}
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
                  title: t("PurchaseNo"),
                  key: "number",
                  width: 110,
                  render: (_, r) => formatDocNo("purchase", r.number),
                },
                {
                  title: t("Supplier"),
                  render: (_, r) =>
                    locale === "ar" ? r.supplierArName : r.supplierEnName,
                },
                {
                  title: t("SupplierInvoiceNo"),
                  dataIndex: "supplierInvoiceNo",
                },
                {
                  title: t("EntryDate"),
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
                <span>{t("PurchaseNo")}</span>
                <Link href={`/invoices/purchases/${purchase.id}`}>
                  {formatDocNo("purchase", purchase.number)}
                </Link>
              </div>
              <div>
                <span>{t("Supplier")}</span>
                <span>
                  {locale === "ar"
                    ? purchase.supplierArName
                    : purchase.supplierEnName}
                </span>
              </div>
              <div>
                <span>{t("SupplierInvoiceNo")}</span>
                <bdi>{purchase.supplierInvoiceNo}</bdi>
              </div>
              <div>
                <span>{t("SupplierInvoiceDate")}</span>
                <bdi>{formatDay(purchase.supplierInvoiceDate)}</bdi>
              </div>
              <div>
                <span>{t("EntryDate")}</span>
                <bdi>{formatDateTime(purchase.date)}</bdi>
              </div>
              <div>
                <span>{t("TaxMode")}</span>
                <span>{tTax(purchase.taxMode)}</span>
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
                  <Col xs={12} md={8}>
                    <div className="mb-1">
                      {t("ReturnDate")} {!canChangeDate && <LockOutlined />}
                    </div>
                    <DayPicker
                      disabled={!canChangeDate}
                      min={minDay}
                      max={todayDay}
                      value={date}
                      onChange={(day) => setDate(day || todayDay)}
                    />
                  </Col>
                  <Col xs={12} md={8}>
                    <div className="mb-1">{t("SupplierNoteNo")}</div>
                    <Input
                      dir="ltr"
                      maxLength={50}
                      value={supplierNoteNo}
                      onChange={(e) => setSupplierNoteNo(e.target.value)}
                    />
                  </Col>
                  <Col xs={24} md={8}>
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
                  total={totals.total}
                  value={payments}
                  onChange={setPayments}
                  creditLabel={t("CreditFromSupplier")}
                />
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card size="small" title={t("Totals")} className="mb-3">
                <TotalsSummary totals={totals} taxMode={purchase.taxMode} />
              </Card>
              <Space wrap>
                <PreviewBeforeSave
                  kind="purchaseReturn"
                  buildDoc={buildPreview}
                />
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

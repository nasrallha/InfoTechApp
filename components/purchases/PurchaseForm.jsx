"use client";

import { useMemo, useState } from "react";
import { lineQtyProblem } from "@/lib/unit-qty";
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
} from "antd";
import QuickAddParty from "@/components/parties/QuickAddParty";
import NextDocNo from "@/components/common/NextDocNo";
import { message } from "@/components/common/feedback";
import {
  ClearOutlined,
  DeleteOutlined,
  LockOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { showActionError } from "@/components/common/actionError";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { calcInvoice, round } from "@/lib/invoice-calc";
import { dayOf, today } from "@/lib/dates";
import { applyFieldErrors } from "@/lib/form-errors";
import {
  createPurchaseAction,
  updatePurchaseAction,
} from "@/actions/purchase.actions";
import { TAX_MODES } from "@/validations/system-settings.schema";
import { useSaveKey } from "@/components/common/useSaveKey";
import { useCurrency } from "@/components/common/CurrencyProvider";
import PageHeader from "@/components/common/PageHeader";
import DayPicker from "@/components/common/DayPicker";
import { formatDocNo } from "@/lib/doc-number";
import ProductPicker from "./ProductPicker";
import ProductBrowser from "./ProductBrowser";
import PaymentsEditor, { newPaymentKey } from "./PaymentsEditor";
import TotalsSummary from "./TotalsSummary";
import DiscountInput from "./DiscountInput";
import PreviewBeforeSave from "@/components/printing/PreviewBeforeSave";
import SavePrintButtons from "@/components/printing/SavePrintButtons";
import { printQuery } from "@/lib/print-param";
import {
  previewItems,
  previewPayments,
  previewTotals,
} from "@/lib/preview-doc";
import { LineNoteEditor } from "./LineNote";
import "./purchases.css";
import ScanSafeNumber from "@/components/common/ScanSafeNumber";
import LineSerials from "@/components/serials/LineSerials";
import { useModuleSettings } from "@/components/auth/AuthProvider";
import PurchaseSizeGrid from "./PurchaseSizeGrid";

let lineSeq = 0;

// ---------- القيم الأولية (فارغة للإضافة، أو من الفاتورة المحفوظة للتعديل) ----------
const initialItems = (purchase) =>
  (purchase?.items ?? []).map((i) => ({
    key: `l${++lineSeq}`,
    productId: i.productId,
    code: i.code,
    arName: i.arName,
    enName: i.enName,
    units: i.units,
    unitId: i.unit.id,
    qty: i.qty,
    price: i.price,
    discountType: i.discountType,
    discountValue: i.discountValue,
    note: i.note ?? "",
    // نسبة الصنف الحالية (لو الفاتورة كانت "بدون ضريبة" النسبة المحفوظة صفر)
    taxRate: i.productTaxRate ?? i.taxRate,
    // الأرقام التسلسلية المسجلة مع الشراء (وحدة serials)
    serialCount: i.serialCount ?? 0,
    serialLabel1: i.serialLabel1 ?? null,
    serialLabel2: i.serialLabel2 ?? null,
    serials: (i.serials ?? []).map((x) => ({
      serial: x.serial,
      serial2: x.serial2 ?? null,
      isUsed: Boolean(x.isUsed),
    })),
  }));

const initialDiscount = (purchase) =>
  purchase
    ? { type: purchase.discountType, value: purchase.discountValue }
    : { type: "amount", value: 0 };

// إضافة: لم يختر بعد (null) / تعديل: المدفوعات المحفوظة ([] = آجل)
const initialPayments = (purchase) =>
  purchase
    ? purchase.payments.map((p) => ({
        key: newPaymentKey(),
        paymentMethodId: p.paymentMethodId,
        amount: p.amount,
        reference: p.reference ?? "",
        auto: false,
      }))
    : null;

// ============================================================
// فاتورة شراء جديدة
// suppliers: الموردون النشطون، methods: طرق الدفع (بدون الآجل)
// defaultTaxMode: من الإعدادات العامة
// canChangeTaxMode / canChangeDate: صلاحيات المستخدم
// ============================================================
export default function PurchaseForm({
  suppliers: suppliersProp = [],
  categories,
  methods,
  creditMethod,
  defaultTaxMode,
  canChangeTaxMode,
  canChangeDate,
  warehouses = [],
  defaultWarehouseId = null,
  canChooseWarehouse = false,
  purchase = null,
}) {
  const [form] = Form.useForm();
  // تكرار نفس الصنف في سطور (كل سطر بوصفه) - من الإعدادات العامة
  const { allowDuplicateLines = false } = useModuleSettings();
  // الإضافة السريعة: الجديد بيظهر في القائمة على طول (قبل ما الصفحة تتحدث)
  const [addedParties, setAddedParties] = useState([]);
  const suppliers = useMemo(() => {
    const ids = new Set(suppliersProp.map((x) => x.id));
    return [...suppliersProp, ...addedParties.filter((x) => !ids.has(x.id))];
  }, [suppliersProp, addedParties]);
  // التعديل: نبدأ ببيانات الفاتورة المحفوظة
  const isEdit = Boolean(purchase);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Purchases");
  const tTax = useTranslations("TaxModes");
  const tAlerts = useTranslations("Alerts");
  const tSidebar = useTranslations("Sidebar");
  const { amount: money, decimals } = useCurrency();
  // بصمة الحفظ: الضغط على حفظ مرتين (أو بعد ما الرد يضيع) مايكررش المستند
  const saveKey = useSaveKey();
  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);

  const [items, setItems] = useState(() => initialItems(purchase));
  const [taxMode, setTaxMode] = useState(purchase?.taxMode ?? defaultTaxMode);
  const [discount, setDiscount] = useState(() => initialDiscount(purchase));
  // null = لم يختر طريقة الدفع بعد، [] = آجل بالكامل
  const [payments, setPayments] = useState(() => initialPayments(purchase));
  const [saving, setSaving] = useState(null); // "save" | "print-thermal" | "print-a4"

  const supplierId = Form.useWatch("supplierId", form);
  const supplierInvoiceDate = Form.useWatch("supplierInvoiceDate", form);
  const supplier = suppliers.find((s) => s.id === supplierId);
  const todayDay = today();

  // "بدون ضريبة" مسموح دائماً لمورد ليس له رقم ضريبي
  const modeLocked = !canChangeTaxMode;
  const modeOptions = TAX_MODES.map((m) => ({
    value: m,
    label: tTax(m),
    disabled:
      modeLocked &&
      m !== defaultTaxMode &&
      m !== purchase?.taxMode &&
      !(m === "none" && supplier && !supplier.taxNo),
  }));

  // ---------- الحساب ----------
  const { lines, totals } = useMemo(
    () =>
      calcInvoice({
        items,
        taxMode,
        discountType: discount.type,
        discountValue: discount.value,
        decimals,
      }),
    [items, taxMode, discount, decimals],
  );

  // ---------- معاينة قبل الحفظ ----------
  const buildPreview = (ctx) => {
    if (!items.length) return null;
    const header = form.getFieldsValue();
    const sup = suppliers.find((x) => x.id === header.supplierId);
    return {
      preview: true,
      type: "purchase",
      number: isEdit ? purchase.number : ctx.number,
      date:
        header.date && header.date !== todayDay
          ? header.date
          : new Date().toISOString(),
      branch: ctx.branch,
      createdBy: ctx.user,
      supplierArName: sup?.arName ?? "",
      supplierEnName: sup?.enName ?? "",
      supplierTaxNo: sup?.taxNo ?? null,
      supplierInvoiceNo: header.supplierInvoiceNo,
      supplierInvoiceDate: header.supplierInvoiceDate,
      taxMode,
      notes: header.notes,
      items: previewItems(lines),
      ...previewTotals(totals),
      ...previewPayments(
        payments,
        [...methods, creditMethod].filter(Boolean),
        totals.total,
      ),
    };
  };

  // ---------- الأصناف ----------
  // المقاسات (وحدة variants): رقم الموديل اللي شبكة كمياته مفتوحة
  const [sizeGrid, setSizeGrid] = useState(null);
  // السعر الافتراضي = تكلفة الوحدة (في "شامل" نضيف عليها الضريبة)
  const defaultPrice = (unit, taxRate, mode = taxMode) =>
    mode === "inclusive"
      ? round(unit.cost * (1 + taxRate / 100), decimals)
      : round(unit.cost, decimals);

  // options (من نافذة الأصناف): { qty, price } اللذان كتبهما المستخدم
  const addProduct = (product, unitId, options = {}) => {
    // المقاسات (وحدة variants): الموديل ← شبكة الكميات
    if (product.sizePick) return setSizeGrid(product.sizePick);
    const addQty = options.qty > 0 ? options.qty : 1;
    setItems((prev) => {
      // نفس الصنف بنفس الوحدة: نزيد الكمية (والسعر الجديد لو كُتب)
      // إلا لو الإعداد بيسمح بتكرار الصنف (كل سطر بوصفه)
      const found =
        !allowDuplicateLines &&
        prev.find((l) => l.productId === product.id && l.unitId === unitId);
      if (found) {
        return prev.map((l) =>
          l === found
            ? {
                ...l,
                qty: round(l.qty + addQty, 3),
                ...(options.price != null ? { price: options.price } : {}),
              }
            : l,
        );
      }
      const unit =
        product.units.find((u) => u.unit.id === unitId) ?? product.units[0];
      return [
        ...prev,
        {
          key: `l${++lineSeq}`,
          productId: product.id,
          code: product.code,
          arName: product.arName,
          enName: product.enName,
          units: product.units,
          unitId: unit.unit.id,
          qty: addQty,
          price: options.price ?? defaultPrice(unit, product.taxRate),
          discountType: "amount",
          discountValue: 0,
          taxRate: product.taxRate,
          serialCount: product.serialCount ?? 0,
          serialLabel1: product.serialLabel1 ?? null,
          serialLabel2: product.serialLabel2 ?? null,
          serials: [],
        },
      ];
    });
  };

  const updateLine = (key, patch) =>
    setItems((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );

  const changeUnit = (line, unitId) => {
    const unit = line.units.find((u) => u.unit.id === unitId);
    updateLine(line.key, { unitId, price: defaultPrice(unit, line.taxRate) });
  };

  // ---------- المورد ----------
  // fresh: المورد الجديد (من الإضافة السريعة) قبل ما يدخل القائمة
  const onSupplierChange = (id, fresh) => {
    const s = fresh ?? suppliers.find((x) => x.id === id);
    // مورد بدون رقم ضريبي ← بدون ضريبة
    if (s && !s.taxNo && taxMode !== "none") {
      setTaxMode("none");
      message.info(t("NoTaxSupplier"));
    } else if (s?.taxNo && taxMode === "none" && defaultTaxMode !== "none") {
      setTaxMode(defaultTaxMode);
    }
  };

  // ---------- الحفظ ----------
  // مسح كل ما تم إدخاله والبدء من جديد
  // (في التعديل: يرجع لبيانات الفاتورة المحفوظة)
  const resetAll = () => {
    form.resetFields();
    setItems(initialItems(purchase));
    setTaxMode(purchase?.taxMode ?? defaultTaxMode);
    setDiscount(initialDiscount(purchase));
    setPayments(initialPayments(purchase));
  };

  const save = async (mode) => {
    let header;
    try {
      header = await form.validateFields();
    } catch {
      return;
    }
    if (!items.length) return message.error(tAlerts("NoItems"));
    if (items.some((l) => !(l.qty > 0))) return message.error(t("QtyRequired"));
    if (payments === null) return message.error(t("ChoosePaymentMethod"));
    if (payments.some((p) => !(p.amount > 0)))
      return message.error(t("PaymentAmountRequired"));
    const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    if (round(paid, decimals) > totals.total)
      return message.error(t("PaidExceedsTotal"));

    setSaving(mode);
    const save = isEdit
      ? updatePurchaseAction
      : (payload) => saveKey.send(createPurchaseAction, payload);
    const res = await save({
      ...(isEdit ? { id: purchase.id } : {}),
      supplierId: header.supplierId,
      supplierInvoiceNo: header.supplierInvoiceNo,
      supplierInvoiceDate: header.supplierInvoiceDate,
      date: canChangeDate ? header.date : undefined,
      warehouseId: canChooseWarehouse ? header.warehouseId : undefined,
      taxMode,
      discountType: discount.type,
      discountValue: Number(discount.value) || 0,
      notes: header.notes,
      items: items.map((l) => ({
        productId: l.productId,
        unitId: l.unitId,
        qty: Number(l.qty),
        price: Number(l.price) || 0,
        discountType: l.discountType,
        discountValue: Number(l.discountValue) || 0,
        note: l.note?.trim() || null,
        serials: l.serials ?? [],
      })),
      payments: payments.map((p) => ({
        paymentMethodId: p.paymentMethodId,
        amount: Number(p.amount),
        reference: p.reference,
      })),
    });

    if (!res.success) {
      setSaving(null);
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      showActionError(res, tAlerts, locale);
      return;
    }

    message.success(
      t(isEdit ? "PurchaseUpdated" : "PurchaseSaved", {
        number: formatDocNo("purchase", res.data.number),
      }),
    );
    router.push(`/invoices/purchases/${res.data.id}${printQuery(mode)}`);
    // الشاشة ترجع فاضية لفاتورة جديدة
    if (!isEdit) resetAll();
    setSaving(null);
  };

  // ---------- جدول الأصناف ----------
  const columns = [
    {
      title: "#",
      key: "i",
      width: 45,
      align: "center",
      render: (_, __, i) => i + 1,
    },
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
          <LineNoteEditor
            value={l.note}
            onChange={(note) => updateLine(l.key, { note })}
          />
          {/* الأرقام التسلسلية: اختياري في الشراء */}
          <LineSerials
            line={l}
            factor={l.units.find((u) => u.unit.id === l.unitId)?.factor ?? 1}
            withWarranty={false}
            optional
            onChange={(patch) => updateLine(l.key, patch)}
          />
        </div>
      ),
    },
    {
      title: t("Unit"),
      key: "unit",
      width: 120,
      render: (_, l) => (
        <Select
          size="small"
          style={{ width: "100%" }}
          value={l.unitId}
          onChange={(v) => changeUnit(l, v)}
          options={l.units.map((u) => ({
            value: u.unit.id,
            label: nameOf(u.unit),
          }))}
        />
      ),
    },
    {
      title: t("Qty"),
      key: "qty",
      width: 100,
      render: (_, l) => (
        <ScanSafeNumber
          field="qty"
          size="small"
          style={{ width: "100%" }}
          min={0}
          precision={3}
          controls={false}
          value={l.qty}
          status={l.qty > 0 && !lineQtyProblem(l) ? undefined : "error"}
          onChange={(v) => updateLine(l.key, { qty: v ?? 0 })}
          formatter={(v) => (v === "" || v == null ? "" : String(Number(v)))}
        />
      ),
    },
    {
      title: taxMode === "inclusive" ? t("PriceIncl") : t("Price"),
      key: "price",
      width: 115,
      render: (_, l) => (
        <ScanSafeNumber
          field="price"
          size="small"
          style={{ width: "100%" }}
          min={0}
          precision={decimals}
          controls={false}
          value={l.price}
          onChange={(v) => updateLine(l.key, { price: v ?? 0 })}
        />
      ),
    },
    {
      title: t("Discount"),
      key: "discount",
      width: 250,
      render: (_, l) => (
        <DiscountInput
          type={l.discountType}
          value={l.discountValue}
          onChange={(type, value) =>
            updateLine(l.key, { discountType: type, discountValue: value })
          }
        />
      ),
    },
    {
      title: t("TaxRate"),
      key: "rate",
      width: 70,
      align: "center",
      render: (_, l) => (taxMode === "none" ? "—" : `${l.taxRate}%`),
    },
    {
      title: t("Net"),
      key: "net",
      width: 100,
      align: "end",
      render: (_, l) => money(l.net),
    },
    {
      title: t("Tax"),
      key: "tax",
      width: 90,
      align: "end",
      render: (_, l) => money(l.tax),
    },
    {
      title: t("Total"),
      key: "total",
      width: 110,
      align: "end",
      render: (_, l) => <b>{money(l.total)}</b>,
    },
    {
      title: "",
      key: "del",
      width: 45,
      align: "center",
      render: (_, l) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() =>
            setItems((prev) => prev.filter((x) => x.key !== l.key))
          }
        />
      ),
    },
  ];
  const TABLE_WIDTH = columns.reduce((s, c) => s + c.width, 0);

  return (
    <div className="pur">
      <PageHeader
        title={
          isEdit ? (
            `${t("EditPurchase")} ${formatDocNo("purchase", purchase.number)}`
          ) : (
            <span className="flex flex-wrap items-center gap-3">
              {t("NewPurchase")} <NextDocNo type="purchase" />
            </span>
          )
        }
      />

      {/* ============ بيانات الفاتورة ============ */}
      <Card size="small" className="mb-3">
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={
            isEdit
              ? {
                  supplierId: purchase.supplierId,
                  supplierInvoiceNo: purchase.supplierInvoiceNo,
                  supplierInvoiceDate: purchase.supplierInvoiceDate,
                  date: dayOf(purchase.date),
                  notes: purchase.notes ?? "",
                  warehouseId: purchase.warehouseId,
                }
              : {
                  supplierInvoiceDate: todayDay,
                  date: todayDay,
                  warehouseId: defaultWarehouseId,
                }
          }
        >
          <Row gutter={[12, 0]}>
            <Col xs={24} md={8}>
              <Form.Item label={tSidebar("Suppliers")} required>
                <Space.Compact style={{ width: "100%" }}>
                  <Form.Item
                    name="supplierId"
                    noStyle
                    rules={[
                      { required: true, message: tAlerts("RequiredField") },
                    ]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder={t("ChooseSupplier")}
                      style={{ width: "100%" }}
                      onChange={onSupplierChange}
                      options={suppliers.map((s) => ({
                        value: s.id,
                        label: `${s.code} - ${nameOf(s)}`,
                      }))}
                    />
                  </Form.Item>
                  {/* إضافة مورد جديد من غير ما تسيب الفاتورة */}
                  <QuickAddParty
                    kind="suppliers"
                    onCreated={(s) => {
                      setAddedParties((prev) => [...prev, s]);
                      form.setFieldValue("supplierId", s.id);
                      onSupplierChange(s.id, s);
                    }}
                  />
                </Space.Compact>
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item
                name="supplierInvoiceNo"
                label={t("SupplierInvoiceNo")}
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message: tAlerts("RequiredField"),
                  },
                  { max: 50, message: tAlerts("TextTooLong") },
                ]}
              >
                <Input dir="ltr" maxLength={50} />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item
                name="supplierInvoiceDate"
                label={t("SupplierInvoiceDate")}
                rules={[{ required: true, message: tAlerts("RequiredField") }]}
              >
                <DayPicker
                  max={todayDay}
                  onChange={(day) => {
                    // تاريخ التسجيل لا يكون قبل تاريخ فاتورة المورد
                    if (day && form.getFieldValue("date") < day) {
                      form.setFieldValue("date", day);
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item
                name="date"
                label={
                  <span>
                    {t("EntryDate")} {!canChangeDate && <LockOutlined />}
                  </span>
                }
                tooltip={t("EntryDateHint")}
                dependencies={["supplierInvoiceDate"]}
                rules={[
                  { required: true, message: tAlerts("RequiredField") },
                  ({ getFieldValue }) => ({
                    validator: (_, v) =>
                      !v ||
                      !getFieldValue("supplierInvoiceDate") ||
                      v >= getFieldValue("supplierInvoiceDate")
                        ? Promise.resolve()
                        : Promise.reject(
                            new Error(tAlerts("DateBeforeSupplierInvoice")),
                          ),
                  }),
                ]}
              >
                <DayPicker
                  disabled={!canChangeDate}
                  min={supplierInvoiceDate || undefined}
                  max={todayDay}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item
                label={
                  <span>
                    {t("TaxMode")} {modeLocked && <LockOutlined />}
                  </span>
                }
              >
                <Select
                  value={taxMode}
                  onChange={setTaxMode}
                  options={modeOptions}
                />
              </Form.Item>
            </Col>
            {/* المستودع: يظهر لمن يملك صلاحية اختياره (وإلا مستودع الفرع تلقائياً) */}
            {canChooseWarehouse && warehouses.length > 1 && (
              <Col xs={24} md={8}>
                <Form.Item
                  name="warehouseId"
                  label={t("Warehouse")}
                  rules={[
                    { required: true, message: tAlerts("RequiredField") },
                  ]}
                >
                  <Select
                    options={warehouses.map((w) => ({
                      value: w.id,
                      label: nameOf(w),
                    }))}
                  />
                </Form.Item>
              </Col>
            )}
            <Col
              xs={24}
              md={canChooseWarehouse && warehouses.length > 1 ? 16 : 24}
            >
              <Form.Item name="notes" label={t("Notes")} className="mb-2">
                <Input.TextArea
                  rows={1}
                  autoSize={{ minRows: 1, maxRows: 3 }}
                  maxLength={500}
                />
              </Form.Item>
            </Col>
          </Row>
          {supplier && (
            <div className="pur-supplier">
              {supplier.taxNo ? (
                <span>
                  {t("SupplierVat")}: <bdi>{supplier.taxNo}</bdi>
                </span>
              ) : (
                <span className="pur-supplier--novat">
                  {t("SupplierNoVat")}
                </span>
              )}
            </div>
          )}
        </Form>
      </Card>

      {/* ============ الأصناف ============ */}
      <Card size="small" className="mb-3">
        {/* إضافة صنف: بالكتابة أو الماسح، أو من نافذة تصفح الأصناف */}
        <div className="pur-add-bar">
          <div className="pur-add-bar__search">
            <ProductPicker onAdd={addProduct} />
          </div>
          <ProductBrowser
            categories={categories}
            onAdd={addProduct}
            defaultPrice={(unit, product) =>
              defaultPrice(unit, product.taxRate)
            }
            priceIncl={taxMode === "inclusive"}
          />
          {sizeGrid && (
            <PurchaseSizeGrid
              modelId={sizeGrid}
              defaultCost={(unit, product) =>
                defaultPrice(unit, product.taxRate)
              }
              onAdd={addProduct}
              onClose={() => setSizeGrid(null)}
            />
          )}
        </div>
        <Table
          className="mt-3"
          size="small"
          bordered
          rowKey="key"
          columns={columns}
          dataSource={lines}
          pagination={false}
          tableLayout="fixed"
          scroll={{ x: TABLE_WIDTH }}
          locale={{ emptyText: t("NoItemsYet") }}
        />
      </Card>

      {/* ============ الخصم والمدفوعات والإجماليات ============ */}
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card size="small" title={t("Payments")} className="h-full">
            <PaymentsEditor
              methods={methods}
              creditMethod={creditMethod}
              total={totals.total}
              value={payments}
              onChange={setPayments}
              creditLabel={t("CreditOnSupplier")}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title={t("Totals")} className="h-full">
            <div className="pur-invoice-discount">
              <span>{t("InvoiceDiscount")}</span>
              <DiscountInput
                type={discount.type}
                value={discount.value}
                onChange={(type, value) => setDiscount({ type, value })}
              />
            </div>
            <TotalsSummary totals={totals} taxMode={taxMode} />
          </Card>
        </Col>
      </Row>

      <Card size="small" className="mt-3">
        {taxMode !== defaultTaxMode && (
          <Alert
            type="warning"
            showIcon
            className="mb-3"
            title={t("TaxModeChanged", { mode: tTax(taxMode) })}
          />
        )}

        <Space wrap>
          <PreviewBeforeSave kind="purchase" buildDoc={buildPreview} />
          <Button
            type="primary"
            size="large"
            icon={<SaveOutlined />}
            loading={saving === "save"}
            disabled={Boolean(saving)}
            onClick={() => save("save")}
          >
            {t("SavePurchase")}
          </Button>
          <SavePrintButtons onSave={save} saving={saving} />
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
      </Card>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
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
  Switch,
  Table,
  Tag,
  Tooltip,
} from "antd";
import {
  ClearOutlined,
  DeleteOutlined,
  GiftOutlined,
  LockOutlined,
  SaveOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { calcInvoice, round } from "@/lib/invoice-calc";
import { applyPromotions } from "@/lib/promotions";
import { dayOf, today } from "@/lib/dates";
import { applyFieldErrors } from "@/lib/form-errors";
import { formatDocNo, saleDocNo } from "@/lib/doc-number";
import {
  browseSaleProductsAction,
  createSaleAction,
  searchSaleProductsAction,
  updateSaleAction,
} from "@/actions/sale.actions";
import {
  createQuotationAction,
  updateQuotationAction,
} from "@/actions/quotation.actions";
import NextDocNo from "@/components/common/NextDocNo";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useSaveKey } from "@/components/common/useSaveKey";
import { useCurrency } from "@/components/common/CurrencyProvider";
import PageHeader from "@/components/common/PageHeader";
import DayPicker from "@/components/common/DayPicker";
import ProductPicker from "@/components/purchases/ProductPicker";
import ProductBrowser from "@/components/purchases/ProductBrowser";
import PaymentsEditor, {
  newPaymentKey,
} from "@/components/purchases/PaymentsEditor";
import TotalsSummary from "@/components/purchases/TotalsSummary";
import DiscountInput from "@/components/purchases/DiscountInput";
import { LineNoteEditor } from "@/components/purchases/LineNote";
import "@/components/purchases/purchases.css";
import CustomerB2BAlert from "@/components/zatca/CustomerB2BAlert";
import QuickAddParty from "@/components/parties/QuickAddParty";
import PreviewBeforeSave from "@/components/printing/PreviewBeforeSave";
import SavePrintButtons from "@/components/printing/SavePrintButtons";
import { printQuery } from "@/lib/print-param";
import { exportBuyerMissing } from "@/lib/zatca-tax";
import {
  previewItems,
  previewPayments,
  previewTotals,
} from "@/lib/preview-doc";
import { showZatcaResult } from "@/components/zatca/zatcaUi";
import ScanSafeNumber from "@/components/common/ScanSafeNumber";

let lineSeq = 0;

// سطر جديد من صنف (بأسعار البيع)
export function lineFromProduct(product, unitId, qty = 1, price) {
  const unit =
    product.units.find((u) => u.unit.id === unitId) ?? product.units[0];
  return {
    key: `s${++lineSeq}`,
    productId: product.id,
    code: product.code,
    arName: product.arName,
    enName: product.enName,
    units: product.units,
    unitId: unit.unit.id,
    qty,
    price: price ?? unit.price,
    listPrice: unit.price,
    discountType: "amount",
    discountValue: 0,
    taxRate: product.taxRate,
    taxMode: product.priceIncludesTax ? "inclusive" : "exclusive",
    stock: product.stock,
    cost: product.cost,
    categoryId: product.categoryId ?? null,
  };
}

// سطور محفوظة (فاتورة/عرض سعر) ← سطور الشاشة
const savedLines = (doc) =>
  (doc?.items ?? []).map((i) => {
    const product = i.product;
    const unit = product?.units.find((u) => u.unit.id === i.unit.id);
    return {
      key: `s${++lineSeq}`,
      productId: i.productId,
      code: i.code,
      arName: i.arName,
      enName: i.enName,
      units: product?.units ?? [
        { unit: i.unit, factor: i.factor, price: i.price },
      ],
      unitId: i.unit.id,
      qty: i.qty,
      price: i.price,
      listPrice: unit?.price ?? i.price,
      discountType: i.discountType,
      discountValue: i.discountValue,
      note: i.note ?? "",
      taxRate: i.taxRate,
      taxMode: i.priceIncludesTax ? "inclusive" : "exclusive",
      stock: product?.stock ?? null,
      cost: product?.cost ?? 0,
      categoryId: product?.categoryId ?? null,
    };
  });

// ============================================================
// فاتورة بيع عادية / عرض سعر (نفس الشاشة)
// mode: "sale" | "quotation"
// sale: فاتورة للتعديل، quotation: عرض سعر للتعديل (mode=quotation)
//   أو للتحويل لفاتورة (mode=sale)
// perms: { changePrice, discount, credit, changeDate }
// ============================================================
export default function SaleForm({
  mode = "sale",
  customers: customersProp = [],
  categories = [],
  methods = [],
  creditMethod = null,
  perms = {},
  sale = null,
  quotation = null,
  shift = null,
  promotions = [],
  zatca = null, // { active, sendOnSave } لو الفرع مربوط بالزكاة
  isExport = false, // فاتورة تصدير جديدة (?export=1)
}) {
  const [form] = Form.useForm();
  // الإضافة السريعة: الجديد بيظهر في القائمة على طول (قبل ما الصفحة تتحدث)
  const [addedParties, setAddedParties] = useState([]);
  const customers = useMemo(() => {
    const ids = new Set(customersProp.map((x) => x.id));
    return [...customersProp, ...addedParties.filter((x) => !ids.has(x.id))];
  }, [customersProp, addedParties]);
  const isQuotation = mode === "quotation";
  // فاتورة التصدير: ضريبة صفرية على كل الأصناف (بنفس السعر) ولازم عميل برّه المملكة
  const exportMode = !isQuotation && (isExport || Boolean(sale?.isExport));
  const source = sale ?? quotation;
  const isEdit = Boolean(sale) || (isQuotation && Boolean(quotation));
  const converting = !isQuotation && Boolean(quotation) && !sale;
  const zatcaOn = Boolean(zatca?.active) && !isQuotation;
  const [zatcaSend, setZatcaSend] = useState(zatca?.sendOnSave ?? true);
  const tZ = useTranslations("Zatca");
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Sales");
  const tP = useTranslations("Purchases");
  const tAlerts = useTranslations("Alerts");
  const { amount: money, decimals } = useCurrency();
  // بصمة الحفظ: الضغط على حفظ مرتين (أو بعد ما الرد يضيع) مايكررش المستند
  const saveKey = useSaveKey();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  const [items, setItems] = useState(() => savedLines(source));
  const [discount, setDiscount] = useState(() =>
    source
      ? { type: source.discountType, value: source.discountValue }
      : { type: "amount", value: 0 },
  );
  const [payments, setPayments] = useState(() =>
    sale
      ? sale.payments.map((p) => ({
          key: newPaymentKey(),
          paymentMethodId: p.paymentMethodId,
          amount: p.amount,
          reference: p.reference ?? "",
          auto: false,
        }))
      : null,
  );
  const [saving, setSaving] = useState(null);
  const customerId = Form.useWatch("customerId", form);
  const customer = customers.find((c) => c.id === customerId);
  const exportMissing = exportMode ? exportBuyerMissing(customer) : [];
  const todayDay = today();

  // العروض الشغالة بتنزل لوحدها (نفس حساب السيرفر)
  const { lines, totals, invoicePromo } = useMemo(() => {
    const applied = applyPromotions({
      items: exportMode
        ? items.map((l) => ({ ...l, taxRate: 0, taxMode: "exclusive" }))
        : items,
      promos: promotions,
      discountType: discount.type,
      discountValue: discount.value,
      decimals,
    });
    return {
      ...calcInvoice({
        items: applied.items,
        taxMode: "exclusive",
        discountType: applied.discountType,
        discountValue: applied.discountValue,
        decimals,
      }),
      invoicePromo: applied.invoicePromo,
    };
  }, [items, discount, decimals, promotions, exportMode]);
  const hasLinePromo = lines.some((l) => l.promo);

  // ---------- الأصناف ----------
  const addProduct = (product, unitId, options = {}) => {
    const addQty = options.qty > 0 ? options.qty : 1;
    const uid = unitId ?? product.exactUnitId ?? product.units[0].unit.id;
    setItems((prev) => {
      const found = prev.find(
        (l) => l.productId === product.id && l.unitId === uid,
      );
      if (found) {
        return prev.map((l) =>
          l === found ? { ...l, qty: round(l.qty + addQty, 3) } : l,
        );
      }
      return [...prev, lineFromProduct(product, uid, addQty)];
    });
  };
  const updateLine = (key, patch) =>
    setItems((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  const changeUnit = (line, unitId) => {
    const unit = line.units.find((u) => u.unit.id === unitId);
    updateLine(line.key, {
      unitId,
      price: unit?.price ?? line.price,
      listPrice: unit?.price ?? line.price,
    });
  };
  const factorOf = (l) =>
    l.units.find((u) => u.unit.id === l.unitId)?.factor ?? 1;

  // ---------- معاينة قبل الحفظ ----------
  const buildPreview = (ctx) => {
    if (!items.length) return null;
    const header = form.getFieldsValue();
    const cust = customers.find((c) => c.id === header.customerId);
    const pay = isQuotation
      ? { payments: [], remainingAmount: 0 }
      : previewPayments(
          payments,
          [...methods, creditMethod].filter(Boolean),
          totals.total,
        );
    return {
      preview: true,
      type: isQuotation ? "quotation" : "sale",
      isExport: exportMode,
      number: isEdit ? source.number : ctx.number,
      date:
        header.date && header.date !== todayDay
          ? header.date
          : new Date().toISOString(),
      validUntil: header.validUntil,
      branch: ctx.branch,
      createdBy: ctx.user,
      customer: cust ? { phone: cust.phone } : null,
      customerArName: cust?.arName ?? header.customerName ?? null,
      customerEnName: cust?.enName ?? header.customerName ?? null,
      customerTaxNo: cust?.taxNo ?? null,
      notes: header.notes,
      items: previewItems(lines),
      ...previewTotals(totals),
      ...pay,
      changeAmount: 0,
      tenderedAmount: 0,
      zatcaDocument: null,
    };
  };

  // ---------- الحفظ ----------
  const resetAll = () => {
    form.resetFields();
    setItems(savedLines(source));
    setDiscount(
      source
        ? { type: source.discountType, value: source.discountValue }
        : { type: "amount", value: 0 },
    );
    setPayments(null);
  };

  // بعد الحفظ: الشاشة ترجع فاضية (لو المستخدم فتح "جديد" تاني يلاقيها جاهزة)
  // Next يحتفظ بالصفحة السابقة في الخلفية، فلازم نفضّيها بنفسنا
  const clearForm = () => {
    form.resetFields();
    setItems([]);
    setDiscount({ type: "amount", value: 0 });
    setPayments(null);
    setSaving(null);
  };

  const save = async (how) => {
    let header;
    try {
      header = await form.validateFields();
    } catch {
      return;
    }
    if (!items.length) return message.error(tAlerts("NoItems"));
    if (items.some((l) => !(l.qty > 0)))
      return message.error(tP("QtyRequired"));

    const itemsPayload = items.map((l) => ({
      productId: l.productId,
      unitId: l.unitId,
      qty: Number(l.qty),
      price: Number(l.price) || 0,
      discountType: l.discountType,
      discountValue: Number(l.discountValue) || 0,
      note: l.note?.trim() || null,
    }));
    if (exportMode && !header.customerId)
      return message.error(tAlerts("ExportCustomerRequired"));
    const common = {
      customerId: header.customerId ?? null,
      discountType: discount.type,
      discountValue: Number(discount.value) || 0,
      notes: header.notes,
      items: itemsPayload,
    };

    let res;
    setSaving(how);
    if (isQuotation) {
      const payload = {
        ...common,
        customerName: header.customerName,
        validUntil: header.validUntil,
      };
      res = isEdit
        ? await updateQuotationAction({ ...payload, id: quotation.id })
        : await createQuotationAction(payload);
    } else {
      if (payments === null) {
        setSaving(null);
        return message.error(tP("ChoosePaymentMethod"));
      }
      if (payments.some((p) => !(p.amount > 0))) {
        setSaving(null);
        return message.error(tP("PaymentAmountRequired"));
      }
      const paid = round(
        payments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
        decimals,
      );
      if (paid > totals.total) {
        setSaving(null);
        return message.error(tP("PaidExceedsTotal"));
      }
      if (paid < totals.total && !header.customerId) {
        setSaving(null);
        return message.error(tAlerts("CustomerRequiredForCredit"));
      }
      const payload = {
        ...common,
        source: "invoice",
        isExport: exportMode,
        date: perms.changeDate ? header.date : undefined,
        quotationId: converting ? quotation.id : undefined,
        zatcaSend: zatcaOn ? zatcaSend : undefined,
        payments: payments.map((p) => ({
          paymentMethodId: p.paymentMethodId,
          amount: Number(p.amount),
          reference: p.reference,
        })),
      };
      res = sale
        ? await updateSaleAction({ ...payload, id: sale.id })
        : await saveKey.send(createSaleAction, payload);
    }

    if (!res.success) {
      setSaving(null);
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      return showActionError(res, tAlerts, locale);
    }
    if (isQuotation) {
      message.success(
        t("QuotationSaved", {
          number: formatDocNo("quotation", res.data.number),
        }),
      );
      router.push(`/invoices/quotations/${res.data.id}${printQuery(how)}`);
      clearForm();
    } else {
      message.success(
        t(sale ? "SaleUpdated" : "SaleSaved", {
          number: saleDocNo("sale", res.data.number),
        }),
      );
      showZatcaResult(res.data.zatca, { t: tZ });
      router.push(`/invoices/sales/${res.data.id}${printQuery(how)}`);
      clearForm();
    }
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
      title: tP("Item"),
      key: "name",
      width: 230,
      render: (_, l) => {
        const need = l.qty * factorOf(l);
        const short = !isQuotation && l.stock != null && need > l.stock + 1e-9;
        return (
          <div>
            <div className="pur-line__name">
              {nameOf(l)}{" "}
              {l.promo && (
                <Tag color="magenta" icon={<GiftOutlined />}>
                  {nameOf(l.promo)}
                </Tag>
              )}
            </div>
            <div className="pur-line__code">
              <bdi>{l.code}</bdi>
              {l.stock != null && (
                <Tooltip title={t("StockInBranch")}>
                  <Tag
                    className="ms-2"
                    color={short ? "red" : l.stock > 0 ? "green" : "default"}
                    icon={short ? <WarningOutlined /> : null}
                  >
                    {Number(l.stock.toFixed(3))}
                  </Tag>
                </Tooltip>
              )}
            </div>
            <LineNoteEditor
              value={l.note}
              onChange={(note) => updateLine(l.key, { note })}
            />
          </div>
        );
      },
    },
    {
      title: tP("Unit"),
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
      title: tP("Qty"),
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
          status={l.qty > 0 ? undefined : "error"}
          onChange={(v) => updateLine(l.key, { qty: v ?? 0 })}
          formatter={(v) => (v === "" || v == null ? "" : String(Number(v)))}
        />
      ),
    },
    {
      title: (
        <span>
          {t("Price")} {!perms.changePrice && <LockOutlined />}
        </span>
      ),
      key: "price",
      width: 125,
      render: (_, l) => (
        <div>
          <ScanSafeNumber
            field="price"
            size="small"
            style={{ width: "100%" }}
            min={0}
            precision={decimals}
            controls={false}
            disabled={!perms.changePrice}
            value={l.price}
            onChange={(v) => updateLine(l.key, { price: v ?? 0 })}
          />
          <div className="pur-line__code">
            {l.taxMode === "inclusive" ? t("InclTax") : t("ExclTax")}
          </div>
          {l.itemDiscount > 0 && l.qty > 0 && (
            <div className="sale-price-after">
              {t("AfterDiscount")}:{" "}
              <b>{money((l.gross - l.itemDiscount) / l.qty)}</b>
            </div>
          )}
        </div>
      ),
    },
    ...(perms.discount || hasLinePromo
      ? [
          {
            title: tP("Discount"),
            key: "discount",
            width: 230,
            render: (_, l) =>
              l.promo ? (
                <div className="text-center">
                  <Tag color="magenta" icon={<GiftOutlined />}>
                    {t("PromoDiscount")}
                  </Tag>
                  <div>
                    <b>-{money(l.itemDiscount)}</b>
                  </div>
                </div>
              ) : !perms.discount ? (
                "—"
              ) : (
                <DiscountInput
                  type={l.discountType}
                  value={l.discountValue}
                  onChange={(type, value) =>
                    updateLine(l.key, {
                      discountType: type,
                      discountValue: value,
                    })
                  }
                />
              ),
          },
        ]
      : []),
    {
      title: tP("TaxRate"),
      key: "rate",
      width: 70,
      align: "center",
      render: (_, l) => `${l.taxRate}%`,
    },
    {
      title: tP("Net"),
      key: "net",
      width: 100,
      align: "end",
      render: (_, l) => money(l.net),
    },
    {
      title: tP("Tax"),
      key: "tax",
      width: 90,
      align: "end",
      render: (_, l) => money(l.tax),
    },
    {
      title: tP("Total"),
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

  const title = isQuotation
    ? isEdit
      ? `${t("EditQuotation")} ${formatDocNo("quotation", quotation.number)}`
      : t("NewQuotation")
    : sale
      ? `${t("EditSale")} ${saleDocNo("sale", sale.number)}${exportMode ? ` — ${t("Export")}` : ""}`
      : converting
        ? `${t("NewSale")} — ${t("FromQuotation")} ${formatDocNo("quotation", quotation.number)}`
        : exportMode
          ? t("NewExportSale")
          : t("NewSale");

  const plus15 = () => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return dayOf(d);
  };

  return (
    <div className="pur">
      <PageHeader
        title={
          isEdit ? (
            title
          ) : (
            <span className="flex flex-wrap items-center gap-3">
              {title} <NextDocNo type={isQuotation ? "quotation" : "sale"} />
            </span>
          )
        }
      />

      {exportMode && (
        <Alert className="mb-3" type="info" showIcon title={t("ExportHint")} />
      )}

      {!isQuotation && shift && (
        <Alert
          className="mb-3"
          type="info"
          showIcon
          title={t("OnShift", { number: formatDocNo("shift", shift.number) })}
        />
      )}

      <Card size="small" className="mb-3">
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{
            customerId: source?.customerId ?? undefined,
            customerName:
              isQuotation && !source?.customerId
                ? source?.customerArName
                : undefined,
            notes: source?.notes ?? "",
            date: sale ? dayOf(sale.date) : todayDay,
            validUntil: isQuotation
              ? (quotation?.validUntil ?? plus15())
              : undefined,
          }}
        >
          <Row gutter={[12, 0]}>
            <Col xs={24} md={8}>
              <Form.Item label={t("Customer")}>
                <Space.Compact style={{ width: "100%" }}>
                  <Form.Item name="customerId" noStyle>
                    <Select
                      showSearch
                      allowClear
                      optionFilterProp="label"
                      placeholder={t("CashCustomer")}
                      style={{ width: "100%" }}
                      options={customers.map((c) => ({
                        value: c.id,
                        label: `${c.code} - ${nameOf(c)}${c.phone ? ` (${c.phone})` : ""}`,
                      }))}
                    />
                  </Form.Item>
                  {/* إضافة عميل جديد من غير ما تسيب الفاتورة */}
                  <QuickAddParty
                    kind="customers"
                    onCreated={(c) => {
                      setAddedParties((prev) => [...prev, c]);
                      form.setFieldValue("customerId", c.id);
                    }}
                  />
                </Space.Compact>
              </Form.Item>
            </Col>
            {isQuotation && !customerId && (
              <Col xs={24} md={6}>
                <Form.Item name="customerName" label={t("CustomerNameFree")}>
                  <Input maxLength={255} />
                </Form.Item>
              </Col>
            )}
            {isQuotation ? (
              <Col xs={12} md={4}>
                <Form.Item
                  name="validUntil"
                  label={t("ValidUntil")}
                  rules={[
                    { required: true, message: tAlerts("RequiredField") },
                  ]}
                >
                  <DayPicker min={todayDay} />
                </Form.Item>
              </Col>
            ) : (
              <Col xs={12} md={4}>
                <Form.Item
                  name="date"
                  label={
                    <span>
                      {t("Date")} {!perms.changeDate && <LockOutlined />}
                    </span>
                  }
                >
                  <DayPicker disabled={!perms.changeDate} max={todayDay} />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} md={isQuotation && !customerId ? 6 : 12}>
              <Form.Item name="notes" label={t("Notes")} className="mb-2">
                <Input.TextArea
                  rows={1}
                  autoSize={{ minRows: 1, maxRows: 3 }}
                  maxLength={isQuotation ? 1000 : 500}
                />
              </Form.Item>
            </Col>
          </Row>
          {customer && (
            <div className="pur-supplier">
              {customer.taxNo ? (
                <span>
                  {t("CustomerVat")}: <bdi>{customer.taxNo}</bdi> —{" "}
                  {t("StandardInvoice")}
                </span>
              ) : (
                <span>{t("SimplifiedInvoice")}</span>
              )}
            </div>
          )}
          {customer && !isQuotation && !exportMode && (
            <CustomerB2BAlert customer={customer} />
          )}
          {exportMode && customer && exportMissing.length > 0 && (
            <Alert
              type="warning"
              showIcon
              className="mt-2"
              title={t("ExportCustomerIncomplete")}
              description={exportMissing
                .map((k) => tZ(`missing.${k}`))
                .join("، ")}
            />
          )}
        </Form>
      </Card>

      <Card size="small" className="mb-3">
        <div className="pur-add-bar">
          <div className="pur-add-bar__search">
            <ProductPicker
              onAdd={addProduct}
              searchAction={searchSaleProductsAction}
            />
          </div>
          <ProductBrowser
            categories={categories}
            onAdd={addProduct}
            browseAction={browseSaleProductsAction}
            defaultPrice={(unit) => unit.price}
            priceLabel={t("Price")}
            showLastCost={false}
          />
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
          locale={{ emptyText: tP("NoItemsYet") }}
        />
      </Card>

      <Row gutter={[12, 12]}>
        {!isQuotation && (
          <Col xs={24} lg={14}>
            <Card size="small" title={tP("Payments")} className="h-full">
              <PaymentsEditor
                methods={methods}
                creditMethod={creditMethod}
                allowCredit={Boolean(perms.credit && customerId)}
                total={totals.total}
                value={payments}
                onChange={setPayments}
                creditLabel={t("CreditOnCustomer")}
              />
              {!customerId && (
                <div className="pur-line__code mt-2">
                  {t("CashCustomerHint")}
                </div>
              )}
            </Card>
          </Col>
        )}
        <Col xs={24} lg={isQuotation ? { span: 10, offset: 14 } : 10}>
          <Card size="small" title={tP("Totals")} className="h-full">
            {invoicePromo ? (
              <Alert
                className="mb-2"
                type="success"
                showIcon
                icon={<GiftOutlined />}
                title={t("InvoicePromoApplied", {
                  name: nameOf(invoicePromo),
                  value:
                    invoicePromo.discountType === "percent"
                      ? `${invoicePromo.value}%`
                      : money(invoicePromo.value),
                })}
              />
            ) : (
              perms.discount && (
                <div className="pur-invoice-discount">
                  <span>{tP("InvoiceDiscount")}</span>
                  <DiscountInput
                    type={discount.type}
                    value={discount.value}
                    onChange={(type, value) => setDiscount({ type, value })}
                  />
                </div>
              )
            )}
            <TotalsSummary totals={totals} taxMode="exclusive" />
          </Card>
        </Col>
      </Row>

      <Card size="small" className="mt-3">
        <Space wrap>
          {zatcaOn && (
            <Tooltip title={tZ("SendOnSaveHint")}>
              <Space size={6} className="me-2">
                <Switch
                  checked={zatcaSend}
                  onChange={setZatcaSend}
                  disabled={Boolean(saving)}
                />
                <span>{tZ("SendToZatcaNow")}</span>
              </Space>
            </Tooltip>
          )}
          <PreviewBeforeSave
            kind={isQuotation ? "quotation" : "sale"}
            buildDoc={buildPreview}
          />
          <Button
            type="primary"
            size="large"
            icon={<SaveOutlined />}
            loading={saving === "save"}
            disabled={Boolean(saving)}
            onClick={() => save("save")}
          >
            {isQuotation ? t("SaveQuotation") : t("SaveSale")}
          </Button>
          <SavePrintButtons onSave={save} saving={saving} />
          <Popconfirm
            title={tP("ResetTitle")}
            description={tP("ResetWarning")}
            okText={tP("ResetConfirm")}
            okButtonProps={{ danger: true }}
            cancelText={tP("Cancel")}
            onConfirm={resetAll}
          >
            <Button
              size="large"
              danger
              icon={<ClearOutlined />}
              disabled={Boolean(saving)}
            >
              {tP("Reset")}
            </Button>
          </Popconfirm>
        </Space>
      </Card>
    </div>
  );
}

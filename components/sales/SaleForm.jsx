"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
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
import { lineQtyProblem, qtyProblemKey } from "@/lib/unit-qty";
import SizePickerModal from "@/components/products/SizePickerModal";
import LineConversion from "@/components/common/LineConversion";
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
import { useModule, useModuleSettings } from "@/components/auth/AuthProvider";
import LineJob from "@/components/technicians/LineJob";
import LineFollowUp from "@/components/follow-ups/LineFollowUp";
import RenewFollowUpsModal from "@/components/follow-ups/RenewFollowUpsModal";
import { customerActiveFollowUpsAction } from "@/actions/follow-up.actions";
import VehiclePicker from "@/components/vehicles/VehiclePicker";
import { LoyaltyHint, useLoyalty } from "@/components/promotions/useLoyalty";
import LineChange, { lineChangeValue } from "@/components/vehicles/LineChange";
import LineSerials, {
  serialInLines,
  serialsShort,
} from "@/components/serials/LineSerials";
import { listSep } from "@/lib/list-sep";

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
    // لون المقاس (دايرة جنب الاسم في السلة)
    color: product.color ?? null,
    colorHex: product.colorHex ?? null,
    unitId: unit.unit.id,
    qty,
    price: price ?? unit.price,
    listPrice: unit.price,
    discountType: "amount",
    discountValue: 0,
    taxRate: product.taxRate,
    taxMode: product.priceIncludesTax ? "inclusive" : "exclusive",
    // خدمة: مالهاش رصيد
    stock: product.isService ? null : product.stock,
    isService: Boolean(product.isService),
    cost: product.cost,
    categoryId: product.categoryId ?? null,
    // الأرقام التسلسلية والضمان (وحدة serials)
    serialCount: product.serialCount ?? 0,
    serialLabel1: product.serialLabel1 ?? null,
    serialLabel2: product.serialLabel2 ?? null,
    warrantyMonths: product.warrantyMonths ?? 0,
    serials: [],
    // الفني والموعد لسطر الخدمة (وحدة technicians)
    job: null,
    // المتابعة الدورية (وحدة followUps): اختيارية للصنف اللي عليه متابعة
    followUpDays: product.followUpDays ?? 0,
    followUp: null,
    // التغيير الدوري للسيارة (وحدة vehicles): null = تلقائي
    changeKm: product.changeKm ?? 0,
    changeMonths: product.changeMonths ?? 0,
    change: null,
  };
}

// خدمات الحجز ← سطور (كل خدمة بمقدم الخدمة بتاع الحجز)
export const bookingLines = (booking) =>
  (booking?.items ?? []).map(({ product, technicianId }) => {
    const line = lineFromProduct(product, product.units[0].unit.id, 1);
    if (technicianId) line.job = { technicianId };
    return line;
  });

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
      stock: product?.isService ? null : (product?.stock ?? null),
      isService: Boolean(product?.isService),
      cost: product?.cost ?? 0,
      categoryId: product?.categoryId ?? null,
      serialCount: product?.serialCount ?? 0,
      serialLabel1: product?.serialLabel1 ?? null,
      serialLabel2: product?.serialLabel2 ?? null,
      warrantyMonths: i.warrantyMonths ?? product?.warrantyMonths ?? 0,
      serials: (i.serials ?? []).map((x) => ({
        serial: x.serialText,
        serial2: x.serial2Text ?? null,
        isUsed: Boolean(x.serial?.isUsed),
      })),
      job:
        i.technicianId || i.jobAt
          ? {
              technicianId: i.technicianId ?? null,
              at: i.jobAt ? new Date(i.jobAt).toISOString() : null,
              address: i.jobAddress ?? null,
              note: i.jobNote ?? null,
              status: i.jobStatus === "done" ? "done" : "pending",
              doneAt: i.jobDoneAt ? new Date(i.jobDoneAt).toISOString() : null,
            }
          : null,
      followUpDays: product?.followUpDays ?? 0,
      changeKm: product?.changeKm ?? 0,
      changeMonths: product?.changeMonths ?? 0,
      // الغيار القادم المحفوظ (فاتورة على سيارة): زي ما هو
      change:
        i.nextKm != null || i.nextDate
          ? {
              applied: true,
              manual: true,
              nextKm: i.nextKm ?? null,
              nextDate: i.nextDate
                ? new Date(i.nextDate).toISOString().slice(0, 10)
                : null,
            }
          : doc?.vehicleId
            ? { applied: false }
            : null,
      // المتابعة اللي اتعملت بالسطر (التعديل)
      followUp: i.followUps?.[0]
        ? {
            id: i.followUps[0].id,
            intervalDays: i.followUps[0].intervalDays,
            place: i.followUps[0].place,
            address: i.followUps[0].address,
            locationUrl: i.followUps[0].locationUrl,
            phone: i.followUps[0].phone,
            notes: i.followUps[0].notes,
          }
        : null,
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
  // فاتورة صيانة من طلب ضمان/صيانة (قطع ومصنعية)
  claim = null,
  // فاتورة صيانة من شاشة المتابعات: { id, customerId } (المتابعة متعلّم عليها)
  followUp = null,
  // فاتورة من حجز: { id, number, customerId, items: [{ product, technicianId }] }
  booking = null,
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
  const source = sale ?? quotation ?? claim;
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
  const tSerial = useTranslations("Serials");
  // الإلزام موجود بس لو الوحدة مفعّلة
  // allowDuplicateLines: نفس الصنف يتضاف سطر جديد (كل سطر بوصفه) بدل زيادة الكمية
  const { serialRequired = false, allowDuplicateLines = false } =
    useModuleSettings();
  const { amount: money, decimals } = useCurrency();
  // بصمة الحفظ: الضغط على حفظ مرتين (أو بعد ما الرد يضيع) مايكررش المستند
  const saveKey = useSaveKey();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  // المقاسات (وحدة variants): رقم الموديل اللي شبكة مقاساته مفتوحة
  const [sizePick, setSizePick] = useState(null);
  const [items, setItems] = useState(() =>
    booking && !source ? bookingLines(booking) : savedLines(source),
  );
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
  // المتابعة الدورية (وحدة followUps): نافذة التجديد وقت الحفظ { list, resolve }
  const followUpsOn = useModule("followUps");
  const [renewAsk, setRenewAsk] = useState(null);
  // السيارة (وحدة vehicles - الورش): فاتورة البيع بس (مش عرض السعر)
  const vehiclesOn = useModule("vehicles") && !isQuotation;
  const savedVehicle = sale?.vehicleId
    ? {
        id: sale.vehicleId,
        plateNo: sale.vehiclePlate,
        vehicleType: sale.vehicleType,
      }
    : null;
  const [vehicle, setVehicle] = useState(savedVehicle);
  const customerId = Form.useWatch("customerId", form);
  const odometer = Form.useWatch("odometer", form);
  const saleDay = Form.useWatch("date", form) ?? today();
  const customer = customers.find((c) => c.id === customerId);
  const exportMissing = exportMode ? exportBuyerMissing(customer) : [];
  const todayDay = today();

  // عروض الولاء للعميل (كل كام مرة ← مرة مجانية) - عرض السعر من غيرها
  const loyalty = useLoyalty(
    isQuotation ? null : customerId,
    promotions,
    sale?.id,
  );

  // العروض الشغالة بتنزل لوحدها (نفس حساب السيرفر)
  const { lines, totals, invoicePromo, loyaltyInfo } = useMemo(() => {
    const applied = applyPromotions({
      items: exportMode
        ? items.map((l) => ({ ...l, taxRate: 0, taxMode: "exclusive" }))
        : items,
      promos: promotions,
      discountType: discount.type,
      discountValue: discount.value,
      decimals,
      loyalty,
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
      loyaltyInfo: applied.loyaltyInfo,
    };
  }, [items, discount, decimals, promotions, exportMode, loyalty]);
  const hasLinePromo = lines.some((l) => l.promo);

  // ---------- الأصناف ----------
  // options.serial: الرقم التسلسلي اللي اتمسح (القطعة بتتضاف برقمها)
  const addProduct = (product, unitId, options = {}) => {
    // المقاسات (وحدة variants): الموديل ← شبكة المقاسات
    if (product.sizePick) return setSizePick(product.sizePick);
    const addQty = options.qty > 0 ? options.qty : 1;
    const uid = unitId ?? product.exactUnitId ?? product.units[0].unit.id;
    const serial = !isQuotation ? (options.serial ?? null) : null;
    if (serial && serialInLines(items, product.id, serial.serial))
      return message.warning(tSerial("DuplicateInList"));
    setItems((prev) => {
      const found =
        !allowDuplicateLines &&
        prev.find((l) => l.productId === product.id && l.unitId === uid);
      if (found) {
        return prev.map((l) =>
          l === found
            ? {
                ...l,
                qty: round(l.qty + addQty, 3),
                ...(serial ? { serials: [...(l.serials ?? []), serial] } : {}),
              }
            : l,
        );
      }
      const line = lineFromProduct(product, uid, addQty);
      if (serial) line.serials = [serial];
      return [...prev, line];
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
      vehiclePlate: vehicle?.plateNo ?? null,
      vehicleType: vehicle?.vehicleType ?? null,
      odometer: vehicle ? (header.odometer ?? null) : null,
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
    setVehicle(savedVehicle);
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
    setVehicle(null);
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
    // الوحدة متقبلش كسور (حبة) والكمية فيها كسر
    const badQty = items.find((l) => lineQtyProblem(l));
    if (badQty)
      return message.error(
        `${tAlerts(qtyProblemKey(lineQtyProblem(badQty)))}: ${nameOf(badQty)}`,
      );

    // الأرقام التسلسلية: الإلزام مفعّل والسطر ناقصه أرقام
    const shortLine = !isQuotation
      ? items.find((l) => serialsShort(l, factorOf(l), serialRequired))
      : null;
    if (shortLine)
      return message.error(
        tSerial("MissingForItem", { name: nameOf(shortLine) }),
      );

    const itemsPayload = items.map((l) => ({
      productId: l.productId,
      unitId: l.unitId,
      qty: Number(l.qty),
      price: Number(l.price) || 0,
      discountType: l.discountType,
      discountValue: Number(l.discountValue) || 0,
      note: l.note?.trim() || null,
      // عرض السعر من غير أرقام تسلسلية أو ضمان
      ...(isQuotation
        ? {}
        : {
            serials: l.serials ?? [],
            warrantyMonths: l.warrantyMonths ?? null,
            job: l.job ?? null,
            followUp: l.followUpDays > 0 ? (l.followUp ?? null) : null,
            change:
              vehiclesOn && vehicle
                ? lineChangeValue(l, { odometer, day: saleDay })
                : null,
          }),
    }));
    // المتابعة محتاجة عميل مسجّل
    if (!isQuotation && !header.customerId && items.some((l) => l.followUp))
      return message.error(tAlerts("FollowUpNeedsCustomer"));
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
      // فاتورة جديدة لعميل عنده متابعات: علاقة الفاتورة بكل متابعة
      // (لا علاقة / تسجيل في السجل فقط / تسجيل وتجديد)
      let renewFollowUpIds = [];
      let logFollowUpIds = [];
      if (!sale && header.customerId && followUpsOn) {
        const r = await customerActiveFollowUpsAction(header.customerId);
        const list = r.success ? r.data : [];
        if (list.length) {
          const picked = await new Promise((resolve) =>
            setRenewAsk({ list, resolve }),
          );
          setRenewAsk(null);
          if (picked === null) return setSaving(null);
          renewFollowUpIds = picked.renew;
          logFollowUpIds = picked.log;
        }
      }
      const payload = {
        ...common,
        renewFollowUpIds,
        logFollowUpIds,
        ...(vehiclesOn
          ? {
              vehicleId: vehicle?.id ?? null,
              odometer: vehicle ? (header.odometer ?? null) : null,
            }
          : {}),
        source: "invoice",
        isExport: exportMode,
        date: perms.changeDate ? header.date : undefined,
        quotationId: converting ? quotation.id : undefined,
        claimId: claim && !sale ? claim.id : undefined,
        bookingId: booking && !sale ? booking.id : undefined,
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
            {!isQuotation && (
              <LineSerials
                line={l}
                factor={factorOf(l)}
                onChange={(patch) => updateLine(l.key, patch)}
              />
            )}
            {!isQuotation && (
              <LineJob
                line={l}
                onChange={(patch) => updateLine(l.key, patch)}
              />
            )}
            {vehiclesOn && vehicle && (
              <LineChange
                line={l}
                odometer={odometer}
                day={saleDay}
                onChange={(patch) => updateLine(l.key, patch)}
              />
            )}
            {!isQuotation && (
              <LineFollowUp
                line={l}
                customer={customer}
                onChange={(patch) => updateLine(l.key, patch)}
              />
            )}
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
      width: 130,
      render: (_, l) => (
        <>
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
          {/* م² ↔ كرتونة (السيراميك) + زرار التقريب */}
          <LineConversion
            line={l}
            onRound={(qty) => updateLine(l.key, { qty })}
          />
        </>
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
        : claim && !sale
          ? `${t("NewSale")} — ${t("FromClaim")} ${formatDocNo("claim", claim.number)}`
          : booking
            ? `${t("NewSale")} — ${formatDocNo("booking", booking.number)}`
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
            customerId:
              source?.customerId ??
              followUp?.customerId ??
              booking?.customerId ??
              undefined,
            customerName:
              isQuotation && !source?.customerId
                ? source?.customerArName
                : undefined,
            notes: source?.notes ?? "",
            odometer: sale?.odometer ?? undefined,
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
          {/* السيارة + قراءة العداد (وحدة vehicles - الورش) */}
          {vehiclesOn && (
            <Row gutter={[12, 0]}>
              <Col xs={24} md={8}>
                <Form.Item label={t("Vehicle")}>
                  <VehiclePicker
                    value={vehicle}
                    customers={customers}
                    customerId={customerId}
                    onChange={(v) => {
                      setVehicle(v);
                      // السيارة ليها عميل والفاتورة لسه من غير عميل
                      if (v?.customerId && !form.getFieldValue("customerId"))
                        form.setFieldValue("customerId", v.customerId);
                    }}
                  />
                </Form.Item>
              </Col>
              {vehicle && (
                <Col xs={12} md={4}>
                  <Form.Item
                    name="odometer"
                    label={t("Odometer")}
                    tooltip={t("OdometerHint")}
                  >
                    <InputNumber
                      min={0}
                      max={9999999}
                      precision={0}
                      controls={false}
                      style={{ width: "100%" }}
                      formatter={(v) =>
                        v === "" || v == null
                          ? ""
                          : Number(v).toLocaleString("en")
                      }
                      parser={(v) => (v ?? "").replace(/[^\d]/g, "")}
                    />
                  </Form.Item>
                </Col>
              )}
            </Row>
          )}
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
          {/* عروض الولاء: مجانية في الفاتورة دي / فاضل كام */}
          {!isQuotation && <LoyaltyHint info={loyaltyInfo} />}
          {exportMode && customer && exportMissing.length > 0 && (
            <Alert
              type="warning"
              showIcon
              className="mt-2"
              title={t("ExportCustomerIncomplete")}
              description={exportMissing
                .map((k) => tZ(`missing.${k}`))
                .join(listSep(locale))}
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
          {sizePick && (
            <SizePickerModal
              modelId={sizePick}
              onClose={() => setSizePick(null)}
              onPick={(v) => {
                setSizePick(null);
                addProduct(v, v.units[0].unit.id);
              }}
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
      {renewAsk && (
        <RenewFollowUpsModal
          list={renewAsk.list}
          preselected={followUp?.id ? [followUp.id] : []}
          onDone={renewAsk.resolve}
        />
      )}
    </div>
  );
}

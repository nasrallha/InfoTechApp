"use client";

import { useMemo, useRef, useState } from "react";
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Col,
  Dropdown,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Segmented,
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
  DisconnectOutlined,
  LockOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  SaveOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { calcInvoice, round } from "@/lib/invoice-calc";
import { dayOf, formatDateTime, today } from "@/lib/dates";
import { noteLineKind, noteLineKindsFor } from "@/lib/note-lines";
import { purchaseDocNo, saleDocNo } from "@/lib/doc-number";
import { printQuery } from "@/lib/print-param";
import SavedDocPrint from "@/components/printing/SavedDocPrint";
import {
  createPurchaseNoteAction,
  createSaleNoteAction,
  updatePurchaseNoteAction,
  updateSaleNoteAction,
  findNoteInvoicesAction,
  getNoteInvoiceAction,
  searchNoteProductsAction,
} from "@/actions/note.actions";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useSaveKey } from "@/components/common/useSaveKey";
import { useCurrency } from "@/components/common/CurrencyProvider";
import NextDocNo from "@/components/common/NextDocNo";
import NoteLineItemsModal from "./NoteLineItemsModal";
import NoteReasonsModal from "./NoteReasonsModal";
import DayPicker from "@/components/common/DayPicker";
import SearchBox from "@/components/common/SearchBox";
import PaymentsEditor, {
  newPaymentKey,
} from "@/components/purchases/PaymentsEditor";
import TotalsSummary from "@/components/purchases/TotalsSummary";
import SavePrintButtons from "@/components/printing/SavePrintButtons";
import { showZatcaResult } from "@/components/zatca/zatcaUi";
import { INVOICE_BASE, NOTE_BASE } from "./NotesList";
import "@/components/purchases/purchases.css";

// رقم المستند اللي عليه الدور (NextDocNo)
const SEQ_TYPE = {
  sale: { credit: "saleCredit", debit: "saleDebit" },
  purchase: { credit: "purchaseCredit", debit: "purchaseDebit" },
};

// اسم فئة الضريبة للنسبة الصفرية
const CATEGORY_LABEL = {
  Z: { ar: "صفري", en: "Zero-rated" },
  E: { ar: "معفى", en: "Exempt" },
  O: { ar: "خارج النطاق", en: "Out of scope" },
};

let lineSeq = 0;
const newKey = () => `l${++lineSeq}`;

// ============================================================
// إشعار دائن / مدين جديد (للعميل أو من المورد)
// 1) الفاتورة الأصلية (اختيارية): بحث برقمها، أو من غير فاتورة ← الطرف + مرجع
// 2) السطور: بند حر (خصم، رسوم شحن ...) بوصف ومبلغ، أو تصحيح سعر صنف
//    (كمية × فرق السعر) - من غير حركة مخزون
// 3) السبب (إلزامي) والتاريخ و"المبالغ شاملة الضريبة"
// 4) الرد / التحصيل: طريقة دفع، أو على حساب الطرف
// ============================================================
export default function NoteForm({
  side,
  initialType,
  initialInvoice,
  // تعديل إشعار (بيانات الفورم من getNoteForEdit)
  note = null,
  methods,
  creditMethod,
  options,
  zatcaActive = false,
  canChangeDate = false,
}) {
  const isEdit = Boolean(note);
  const router = useRouter();
  const locale = useLocale();
  // بعد حفظ مستند جديد: شريط "تم الحفظ" + الطباعة في نفس الشاشة
  const [printJob, setPrintJob] = useState(null);
  const t = useTranslations("Notes");
  const tP = useTranslations("Purchases");
  const tZ = useTranslations("Zatca");
  const tAlerts = useTranslations("Alerts");
  const { amount: money, decimals } = useCurrency();
  const saveKey = useSaveKey();
  const isSale = side === "sale";
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const L = (x) => (locale === "ar" ? x.ar : x.en);
  const docNo = isSale ? saleDocNo : purchaseDocNo;
  const todayDay = today();

  const [type, setType] = useState(note?.type ?? initialType);
  const isCredit = type === "credit";

  // الفاتورة الأصلية
  const [invoice, setInvoice] = useState(initialInvoice ?? null);
  const [lookup, setLookup] = useState("");
  const [finding, setFinding] = useState(false);
  const [candidates, setCandidates] = useState([]);

  // من غير فاتورة: الطرف والمرجع
  const [partyId, setPartyId] = useState(
    note && !note.originalId ? note.partyId : null,
  );
  const [billingRef, setBillingRef] = useState(note?.billingRef ?? "");

  // السبب: عربي (بيتبعت للهيئة) + إنجليزي (للطباعة)
  const [reason, setReason] = useState(note?.reason ?? "");
  const [reasonEn, setReasonEn] = useState(note?.reasonEn ?? "");
  // اختيار سبب من القائمة ← الإنجليزي بتاعه معاه
  const pickReason = (label) => {
    setReason(label);
    const r = reasons.find((x) => x.label === label);
    if (r) setReasonEn(r.enLabel ?? "");
  };
  const [notes, setNotes] = useState(note?.notes ?? "");
  const [date, setDate] = useState(note?.day ?? todayDay);
  const [pricesIncludeTax, setPricesIncludeTax] = useState(
    note?.pricesIncludeTax ??
      initialInvoice?.pricesIncludeTax ??
      options.pricesIncludeTax,
  );
  // المورد: رقم إشعاره وتاريخه
  const [supplierNoteNo, setSupplierNoteNo] = useState(
    note?.supplierNoteNo ?? "",
  );
  const [supplierNoteDate, setSupplierNoteDate] = useState(
    note?.supplierNoteDate ?? null,
  );

  const [lines, setLines] = useState(() =>
    (note?.lines ?? []).map((l) => ({ ...l, key: newKey() })),
  );
  // null = لم يختر طريقة الرد/التحصيل بعد، [] = على الحساب بالكامل
  const [payments, setPayments] = useState(() =>
    note
      ? note.payments.map((p) => ({ ...p, key: newPaymentKey(), auto: false }))
      : null,
  );
  const [saving, setSaving] = useState(null);

  const party = invoice
    ? invoice.partyId
      ? { id: invoice.partyId }
      : null
    : (options.parties.find((p) => p.id === partyId) ?? null);

  // ---------- نسب الضريبة المتاحة للبند الحر ----------
  const taxOptions = useMemo(() => {
    const list = [
      { rate: options.taxRate, category: "S", code: null },
      { rate: 0, category: "O", code: null },
    ];
    for (const i of invoice?.items ?? []) {
      const rate = Number(i.taxRate);
      const category = rate > 0 ? "S" : i.taxCategory || "O";
      const code = rate > 0 ? null : (i.taxExemptionCode ?? null);
      if (
        !list.some(
          (x) => x.rate === rate && x.category === category && x.code === code,
        )
      )
        list.push({ rate, category, code });
    }
    return (
      isSale
        ? list
        : list.filter((x, i, a) => a.findIndex((y) => y.rate === x.rate) === i)
    ).map((x) => ({
      value: `${x.rate}|${x.category}|${x.code ?? ""}`,
      label:
        x.rate > 0 || !isSale
          ? `${x.rate}%`
          : `0% - ${L(CATEGORY_LABEL[x.category] ?? CATEGORY_LABEL.O)}`,
      ...x,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, options.taxRate, isSale, locale]);
  const defaultTax = taxOptions[0];

  // ---------- البنود: الثابتة + المضافة من المستخدم ----------
  const [customItems, setCustomItems] = useState(options.customItems ?? []);
  // أسباب الإشعار (قائمة يديرها المستخدم)
  const [reasons, setReasons] = useState(options.reasons ?? []);
  const [reasonsModal, setReasonsModal] = useState(false);
  const [itemsModal, setItemsModal] = useState(false);
  const customByKey = new Map(customItems.map((c) => [c.key, c]));
  // بند متاح في نوع إشعار (المضاف: لازم يكون شغال ومتعلّم على النوع)
  const kindAllowed = (key, forType) => {
    const c = customByKey.get(key);
    if (c)
      return c.isActive && (forType === "credit" ? c.forCredit : c.forDebit);
    return Boolean(noteLineKind(key)?.[forType]);
  };
  // اسم البند بالعربي والإنجليزي (الوصف الافتراضي للسطر)
  const kindNames = (key) => {
    const c = customByKey.get(key);
    if (c) return { ar: c.arName, en: c.enName || c.arName };
    const k = noteLineKind(key);
    return k ? { ar: k.ar, en: k.en } : { ar: "", en: "" };
  };
  const kindLabel = (key) => {
    const x = kindNames(key);
    return locale === "ar" ? x.ar : x.en;
  };
  const kinds = [
    ...noteLineKindsFor(type).map((k) => ({ key: k.key, label: L(k) })),
    ...customItems
      .filter((c) => kindAllowed(c.key, type))
      .map((c) => ({ key: c.key, label: kindLabel(c.key) })),
  ];

  // ---------- السطور ----------
  const addLine = (kind) => {
    const k = noteLineKind(kind);
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        kind,
        description: k?.product ? "" : kindNames(kind).ar,
        descriptionEn: k?.product ? "" : kindNames(kind).en,
        product: null,
        unitId: null,
        qty: 1,
        price: null,
        tax: defaultTax.value,
      },
    ]);
  };
  const updateLine = (key, patch) =>
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  const removeLine = (key) =>
    setLines((prev) => prev.filter((l) => l.key !== key));

  // تغيير نوع الإشعار: البنود اللي مش متاحة في النوع الجديد بتتشال
  const changeType = (next) => {
    setType(next);
    setLines((prev) => prev.filter((l) => kindAllowed(l.kind, next)));
    setPayments(null);
  };

  // ---------- الحساب (نفس حساب السيرفر) ----------
  const taxOf = (l) => taxOptions.find((x) => x.value === l.tax) ?? defaultTax;
  const calc = useMemo(() => {
    const mode = pricesIncludeTax ? "inclusive" : "exclusive";
    return calcInvoice({
      items: lines.map((l) => {
        const isProduct = noteLineKind(l.kind)?.product;
        return {
          key: l.key,
          qty: isProduct ? Number(l.qty) || 0 : 1,
          price: Number(l.price) || 0,
          taxRate: isProduct ? Number(l.product?.taxRate ?? 0) : taxOf(l).rate,
          taxMode: mode,
        };
      }),
      decimals,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, pricesIncludeTax, decimals, taxOptions]);
  const amountByKey = new Map(calc.lines.map((l) => [l.key, l]));
  const totals = calc.totals;
  const overInvoice =
    isCredit && invoice && totals.total > invoice.value + 0.0001;

  // ---------- الفاتورة الأصلية ----------
  const loadInvoice = async (id) => {
    setFinding(true);
    const res = await getNoteInvoiceAction({
      side,
      id,
      excludeNoteId: note?.id ?? null,
    });
    setFinding(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    if (!res.data)
      return message.error(
        tAlerts(isSale ? "SaleNotFound" : "PurchaseNotFound"),
      );
    setInvoice(res.data);
    setCandidates([]);
    setPricesIncludeTax(res.data.pricesIncludeTax);
    // سطور الأصناف اللي مش في الفاتورة دي بتفضل (ممكن تتعدل)، والطرف من الفاتورة
    setPartyId(null);
    setPayments(null);
  };

  const find = async () => {
    const value = lookup.trim();
    if (!value) return;
    setFinding(true);
    const res = await findNoteInvoicesAction({ side, value });
    setFinding(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    if (!res.data.length) {
      setCandidates([]);
      return message.warning(t("InvoiceNotFoundFor", { q: value }));
    }
    if (res.data.length === 1) return loadInvoice(res.data[0].id);
    setCandidates(res.data);
  };

  const unlinkInvoice = () => {
    setInvoice(null);
    setLookup("");
    setPayments(null);
  };

  // ---------- الحفظ ----------
  const resetAll = () => {
    setInvoice(null);
    setLookup("");
    setCandidates([]);
    setPartyId(null);
    setBillingRef("");
    setReason("");
    setReasonEn("");
    setNotes("");
    setDate(todayDay);
    setSupplierNoteNo("");
    setSupplierNoteDate(null);
    setLines([]);
    setPayments(null);
    saveKey.reset();
  };

  const save = async (mode) => {
    if (!invoice && !billingRef.trim()) return message.error(t("RefRequired"));
    if (!isSale && !party) return message.error(t("ChooseSupplier"));
    if (!reason.trim()) return message.error(t("ReasonRequired"));
    if (!lines.length) return message.error(t("AddLines"));
    for (const l of lines) {
      const k = noteLineKind(l.kind);
      if (k?.product && !(l.product && l.unitId))
        return message.error(t("ChooseProduct"));
      if (k?.product && !(Number(l.qty) > 0))
        return message.error(tP("QtyRequired"));
      if (!k?.product && !l.description?.trim())
        return message.error(t("DescriptionRequired"));
      if (!(Number(l.price) > 0)) return message.error(t("AmountRequired"));
    }
    if (overInvoice)
      return message.error(
        t("ExceedsInvoice", { value: money(invoice.value) }),
      );
    if (payments === null) return message.error(t("ChoosePayment"));
    if (payments.some((p) => !(p.amount > 0)))
      return message.error(tP("PaymentAmountRequired"));
    const paid = round(
      payments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
      decimals,
    );
    if (paid > totals.total) return message.error(tP("PaidExceedsTotal"));
    if (paid < totals.total && !party)
      return message.error(
        tAlerts(isCredit ? "CashCustomerFullRefund" : "CashCustomerFullPay"),
      );

    setSaving(mode);
    const payload = {
      type,
      originalId: invoice?.id ?? null,
      partyId: invoice ? null : (partyId ?? null),
      billingRef: invoice ? null : billingRef.trim(),
      reason: reason.trim(),
      reasonEn: reasonEn.trim() || null,
      date: canChangeDate ? date : undefined,
      pricesIncludeTax,
      notes,
      lines: lines.map((l) => {
        const k = noteLineKind(l.kind);
        const tax = taxOf(l);
        return {
          kind: l.kind,
          productId: k?.product ? l.product.id : null,
          unitId: k?.product ? l.unitId : null,
          qty: k?.product ? Number(l.qty) : 1,
          price: Number(l.price),
          description: l.description?.trim() || null,
          descriptionEn: l.descriptionEn?.trim() || null,
          taxRate: tax.rate,
          taxCategory: tax.category,
          taxExemptionCode: tax.code,
        };
      }),
      payments: payments.map((p) => ({
        paymentMethodId: p.paymentMethodId,
        amount: Number(p.amount),
        reference: p.reference,
      })),
      ...(isSale
        ? {}
        : {
            supplierNoteNo: supplierNoteNo.trim() || null,
            supplierNoteDate: supplierNoteDate || null,
          }),
    };
    const res = isEdit
      ? await (isSale ? updateSaleNoteAction : updatePurchaseNoteAction)({
          ...payload,
          id: note.id,
        })
      : await saveKey.send(
          isSale ? createSaleNoteAction : createPurchaseNoteAction,
          payload,
        );
    if (!res.success) {
      setSaving(null);
      showActionError(res, tAlerts, locale);
      // الفاتورة اتغيرت (إشعار تاني في نفس اللحظة): نحدّث قيمتها
      if (res.error === "NoteExceedsInvoice" && invoice)
        loadInvoice(invoice.id);
      return;
    }
    const text = t("Saved", {
      number: docNo(res.data.type, res.data.number),
    });
    if (isSale) showZatcaResult(res.data.zatca, { t: tZ });
    const path = `${NOTE_BASE[side]}/${res.data.id}`;
    // التعديل: صفحة الإشعار / الجديد: الشاشة بتفضل جاهزة لإشعار جديد
    if (isEdit) {
      message.success(text);
      router.push(`${path}${printQuery(mode)}`);
      return router.refresh();
    }
    setPrintJob({
      kind: isSale ? "saleNote" : "purchaseNote",
      id: res.data.id,
      mode: mode,
      text: text,
      seq: Date.now(),
    });
    resetAll();
    setSaving(null);
  };

  // ---------- جدول السطور ----------
  const invoiceProducts = (invoice?.items ?? [])
    .filter((i) => i.productId)
    .map((i) => ({
      key: `inv${i.id}`,
      id: i.productId,
      code: i.code,
      arName: i.arName,
      enName: i.enName,
      taxRate: i.taxRate,
      units: [{ unit: i.unit, factor: i.factor }],
      fromInvoice: { qty: i.qty, price: i.price, unitId: i.unitId },
    }));

  const columns = [
    {
      title: t("LineKind"),
      key: "kind",
      width: 190,
      render: (_, l) => (
        <Select
          size="small"
          style={{ width: "100%" }}
          value={l.kind}
          onChange={(kind) => {
            const isProduct = noteLineKind(kind)?.product;
            updateLine(l.key, {
              kind,
              // الوصف الافتراضي = اسم البند (لو المستخدم مغيّرهوش)
              ...(isProduct
                ? { description: "", descriptionEn: "" }
                : !l.description || l.description === kindNames(l.kind).ar
                  ? {
                      description: kindNames(kind).ar,
                      descriptionEn: kindNames(kind).en,
                    }
                  : {}),
              ...(isProduct ? {} : { product: null, unitId: null, qty: 1 }),
            });
          }}
          options={kinds.map((k) => ({ value: k.key, label: k.label }))}
        />
      ),
    },
    {
      title: t("DescriptionOrItem"),
      key: "desc",
      width: 300,
      render: (_, l) =>
        noteLineKind(l.kind)?.product ? (
          <div>
            <ProductSelect
              value={l.product}
              invoiceProducts={invoiceProducts}
              onChange={(p) =>
                updateLine(l.key, {
                  product: p,
                  unitId:
                    p?.fromInvoice?.unitId ?? p?.units?.[0]?.unit.id ?? null,
                  qty: p?.fromInvoice?.qty ?? l.qty ?? 1,
                })
              }
            />
            {l.product?.fromInvoice && (
              <div className="pur-line__code">
                {t("InvoicePrice")}:{" "}
                <bdi>{money(l.product.fromInvoice.price)}</bdi>
              </div>
            )}
            <Input
              size="small"
              className="mt-1"
              maxLength={150}
              placeholder={t("LineNoteOptional")}
              value={l.description}
              onChange={(e) =>
                updateLine(l.key, { description: e.target.value })
              }
            />
          </div>
        ) : (
          // الوصف عربي (بيتبعت للهيئة) + إنجليزي (للطباعة)
          <div>
            <Input
              size="small"
              maxLength={150}
              placeholder={t("DescriptionAr")}
              value={l.description}
              onChange={(e) =>
                updateLine(l.key, { description: e.target.value })
              }
            />
            <Input
              size="small"
              className="mt-1"
              dir="ltr"
              maxLength={150}
              placeholder={t("DescriptionEn")}
              value={l.descriptionEn}
              onChange={(e) =>
                updateLine(l.key, { descriptionEn: e.target.value })
              }
            />
          </div>
        ),
    },
    {
      title: tP("Unit"),
      key: "unit",
      width: 110,
      render: (_, l) =>
        noteLineKind(l.kind)?.product && l.product ? (
          <Select
            size="small"
            style={{ width: "100%" }}
            value={l.unitId}
            onChange={(unitId) => updateLine(l.key, { unitId })}
            options={l.product.units.map((u) => ({
              value: u.unit.id,
              label: nameOf(u.unit),
            }))}
          />
        ) : (
          "—"
        ),
    },
    {
      title: tP("Qty"),
      key: "qty",
      width: 90,
      render: (_, l) =>
        noteLineKind(l.kind)?.product ? (
          <InputNumber
            size="small"
            style={{ width: "100%" }}
            min={0}
            precision={3}
            controls={false}
            value={l.qty}
            onChange={(v) => updateLine(l.key, { qty: v })}
          />
        ) : (
          "1"
        ),
    },
    {
      title: (
        <Tooltip title={t("PriceHint")}>
          {t("PriceOrAmount")} <QuestionCircleOutlined />
        </Tooltip>
      ),
      key: "price",
      width: 120,
      render: (_, l) => (
        <InputNumber
          size="small"
          style={{ width: "100%" }}
          min={0}
          precision={decimals}
          controls={false}
          value={l.price}
          onChange={(v) => updateLine(l.key, { price: v })}
        />
      ),
    },
    {
      title: tP("TaxRate"),
      key: "tax",
      width: 150,
      render: (_, l) =>
        noteLineKind(l.kind)?.product ? (
          l.product ? (
            `${l.product.taxRate}%`
          ) : (
            "—"
          )
        ) : (
          <Select
            size="small"
            style={{ width: "100%" }}
            value={l.tax}
            onChange={(tax) => updateLine(l.key, { tax })}
            options={taxOptions.map((x) => ({
              value: x.value,
              label: x.label,
            }))}
          />
        ),
    },
    {
      title: tP("Net"),
      key: "net",
      width: 100,
      align: "end",
      render: (_, l) => money(amountByKey.get(l.key)?.net ?? 0),
    },
    {
      title: tP("Tax"),
      key: "taxAmount",
      width: 90,
      align: "end",
      render: (_, l) => money(amountByKey.get(l.key)?.tax ?? 0),
    },
    {
      title: tP("Total"),
      key: "total",
      width: 110,
      align: "end",
      render: (_, l) => <b>{money(amountByKey.get(l.key)?.total ?? 0)}</b>,
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
          aria-label={tP("Delete")}
          onClick={() => removeLine(l.key)}
        />
      ),
    },
  ];
  const TABLE_WIDTH = columns.reduce((s, c) => s + c.width, 0);

  // أسباب جاهزة (والمستخدم يكتب غيرها)
  // أسباب الإشعار: من القائمة اللي يديرها المستخدم (الشغالة والمتاحة في النوع)
  const reasonOptions = reasons
    .filter((r) => r.isActive && (isCredit ? r.forCredit : r.forDebit))
    .map((r) => ({ value: r.label }));

  return (
    <div className="pur">
      <SavedDocPrint job={printJob} onClose={() => setPrintJob(null)} />
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl flex flex-wrap items-center gap-3">
          {isEdit ? (
            <>
              {t("EditNote")} <bdi>{note.docNo}</bdi>
            </>
          ) : (
            t(`new.${type}`)
          )}
          <Tag>{isSale ? t("ForCustomer") : t("FromSupplier")}</Tag>
          {!isEdit && <NextDocNo type={SEQ_TYPE[side][type]} />}
        </h1>
        {/* التعديل: النوع مبيتغيرش (كل نوع بترقيمه) */}
        <Segmented
          value={type}
          disabled={isEdit}
          onChange={changeType}
          options={[
            { value: "credit", label: t("type.credit") },
            { value: "debit", label: t("type.debit") },
          ]}
        />
      </div>

      <Alert
        className="mb-3"
        type="info"
        showIcon
        title={t(`hint.${side}.${type}`)}
      />

      {/* ============ الفاتورة الأصلية / الطرف ============ */}
      <Card size="small" className="mb-3" title={t("InvoiceAndParty")}>
        {invoice ? (
          <div className="pur-info">
            <div>
              <span>{t("OriginalInvoice")}</span>
              <Link href={`${INVOICE_BASE[side]}/${invoice.id}`}>
                <b>
                  <bdi>{invoice.docNo}</bdi>
                </b>
              </Link>
            </div>
            <div>
              <span>{isSale ? t("Customer") : t("Supplier")}</span>
              <span>
                {(locale === "ar"
                  ? invoice.partyArName
                  : invoice.partyEnName) || t("CashCustomer")}
              </span>
            </div>
            <div>
              <span>{t("Date")}</span>
              <bdi>{formatDateTime(invoice.date)}</bdi>
            </div>
            <div>
              <span>{t("InvoiceTotal")}</span>
              <bdi>{money(invoice.totalAmount)}</bdi>
            </div>
            <div>
              <span>
                <Tooltip title={t("CurrentValueHint")}>
                  {t("CurrentValue")} <QuestionCircleOutlined />
                </Tooltip>
              </span>
              <b>
                <bdi>{money(invoice.value)}</bdi>
              </b>
            </div>
            <div>
              <Button
                size="small"
                icon={<DisconnectOutlined />}
                onClick={unlinkInvoice}
              >
                {t("Unlink")}
              </Button>
            </div>
          </div>
        ) : (
          <Row gutter={[12, 12]}>
            <Col xs={24} md={12} lg={8}>
              <div className="mb-1">
                {t("FindInvoice")}{" "}
                <Tooltip title={t("FindInvoiceHint")}>
                  <QuestionCircleOutlined />
                </Tooltip>
              </div>
              <SearchBox
                width="100%"
                dir="ltr"
                allowClear={false}
                value={lookup}
                onChange={setLookup}
                onSearch={find}
                loading={finding}
                buttonText={tP("ShowInvoice")}
                placeholder={isSale ? "SI-15" : "PI-15"}
              />
            </Col>
            <Col xs={24} md={12} lg={8}>
              <div className="mb-1">
                {isSale ? t("Customer") : t("Supplier")}
                {!isSale && <span className="text-red-500"> *</span>}
              </div>
              <Select
                showSearch
                allowClear
                style={{ width: "100%" }}
                optionFilterProp="label"
                placeholder={isSale ? t("CashCustomer") : t("ChooseSupplier")}
                value={partyId ?? undefined}
                onChange={(v) => {
                  setPartyId(v ?? null);
                  setPayments(null);
                }}
                options={options.parties.map((p) => ({
                  value: p.id,
                  label: `${p.code} - ${nameOf(p)}${p.phone ? ` (${p.phone})` : ""}`,
                }))}
              />
            </Col>
            <Col xs={24} md={12} lg={8}>
              <div className="mb-1">
                {t("BillingRef")} <span className="text-red-500">*</span>{" "}
                <Tooltip title={t("BillingRefHint")}>
                  <QuestionCircleOutlined />
                </Tooltip>
              </div>
              <Input
                maxLength={100}
                value={billingRef}
                onChange={(e) => setBillingRef(e.target.value)}
              />
            </Col>
            {candidates.length > 1 && (
              <Col xs={24}>
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={candidates}
                  onRow={(r) => ({
                    onClick: () => loadInvoice(r.id),
                    style: { cursor: "pointer" },
                  })}
                  columns={[
                    {
                      title: t("OriginalInvoice"),
                      key: "no",
                      render: (_, r) => <bdi>{r.docNo}</bdi>,
                    },
                    ...(!isSale
                      ? [
                          {
                            title: t("SupplierInvoiceNo"),
                            key: "sup",
                            render: (_, r) => (
                              <bdi>{r.supplierInvoiceNo ?? "—"}</bdi>
                            ),
                          },
                        ]
                      : []),
                    {
                      title: isSale ? t("Customer") : t("Supplier"),
                      key: "party",
                      render: (_, r) =>
                        (locale === "ar" ? r.partyArName : r.partyEnName) ||
                        t("CashCustomer"),
                    },
                    {
                      title: t("Date"),
                      key: "date",
                      render: (_, r) => formatDateTime(r.date),
                    },
                    {
                      title: tP("Total"),
                      key: "total",
                      render: (_, r) => money(r.totalAmount),
                    },
                  ]}
                />
              </Col>
            )}
          </Row>
        )}
      </Card>

      {/* ============ بيانات الإشعار ============ */}
      <Card size="small" className="mb-3">
        <Row gutter={[12, 12]}>
          <Col xs={24} md={12} lg={isSale ? 8 : 9}>
            <div className="mb-1">
              {t("ReasonAr")} <span className="text-red-500">*</span>{" "}
              <Tooltip title={t("ReasonHint")}>
                <QuestionCircleOutlined />
              </Tooltip>
            </div>
            <Space.Compact style={{ width: "100%" }}>
              <AutoComplete
                style={{ width: "100%" }}
                options={reasonOptions}
                value={reason}
                onChange={pickReason}
                maxLength={500}
                filterOption={(input, o) =>
                  o.value.toLowerCase().includes(input.toLowerCase())
                }
              />
              <Tooltip title={t("ManageReasons")}>
                <Button
                  icon={<SettingOutlined />}
                  aria-label={t("ManageReasons")}
                  onClick={() => setReasonsModal(true)}
                />
              </Tooltip>
            </Space.Compact>
          </Col>
          <Col xs={24} md={12} lg={isSale ? 6 : 7}>
            <div className="mb-1">{t("ReasonEn")}</div>
            <Input
              dir="ltr"
              maxLength={500}
              value={reasonEn}
              onChange={(e) => setReasonEn(e.target.value)}
            />
          </Col>
          <Col xs={12} md={8} lg={isSale ? 3 : 4}>
            <div className="mb-1">
              {t("Date")} {!canChangeDate && <LockOutlined />}
            </div>
            <DayPicker
              disabled={!canChangeDate}
              min={invoice ? dayOf(invoice.date) : undefined}
              max={todayDay}
              value={date}
              onChange={(day) => setDate(day || todayDay)}
            />
          </Col>
          {!isSale && (
            <>
              <Col xs={12} md={8} lg={4}>
                <div className="mb-1">{t("SupplierNoteNo")}</div>
                <Input
                  maxLength={50}
                  dir="ltr"
                  value={supplierNoteNo}
                  onChange={(e) => setSupplierNoteNo(e.target.value)}
                />
              </Col>
              <Col xs={12} md={8} lg={4}>
                <div className="mb-1">{t("SupplierNoteDate")}</div>
                <DayPicker
                  allowClear
                  max={todayDay}
                  value={supplierNoteDate}
                  onChange={(day) => setSupplierNoteDate(day ?? null)}
                />
              </Col>
            </>
          )}
          <Col xs={12} md={8} lg={isSale ? 3 : 4}>
            <div className="mb-1">
              {t("PricesIncludeTax")}{" "}
              <Tooltip title={t("PricesIncludeTaxHint")}>
                <QuestionCircleOutlined />
              </Tooltip>
            </div>
            <Switch checked={pricesIncludeTax} onChange={setPricesIncludeTax} />
          </Col>
          <Col xs={24} md={16} lg={isSale ? 4 : 16}>
            <div className="mb-1">{t("Notes")}</div>
            <Input
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Col>
        </Row>
      </Card>

      {/* ============ السطور ============ */}
      <Card
        size="small"
        className="mb-3"
        title={t("Lines")}
        extra={
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                ...kinds.map((k) => ({ key: k.key, label: k.label })),
                { type: "divider" },
                {
                  key: "__new",
                  icon: <PlusOutlined />,
                  label: t("NewItem"),
                },
                {
                  key: "__manage",
                  icon: <SettingOutlined />,
                  label: t("ManageItems"),
                },
              ],
              onClick: ({ key }) =>
                key === "__new" || key === "__manage"
                  ? setItemsModal(true)
                  : addLine(key),
            }}
          >
            <Button type="primary" icon={<PlusOutlined />}>
              {t("AddLine")}
            </Button>
          </Dropdown>
        }
      >
        {overInvoice && (
          <Alert
            type="error"
            showIcon
            className="mb-3"
            title={t("ExceedsInvoice", { value: money(invoice.value) })}
          />
        )}
        <Table
          size="small"
          bordered
          rowKey="key"
          columns={columns}
          dataSource={lines}
          pagination={false}
          tableLayout="fixed"
          scroll={{ x: TABLE_WIDTH }}
          locale={{ emptyText: t("NoLinesYet") }}
        />
      </Card>

      {/* ============ الرد / التحصيل والإجماليات ============ */}
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card
            size="small"
            title={
              <span>
                {t(`PayTitle.${side}.${type}`)}{" "}
                <Tooltip title={t(`PayHint.${side}.${type}`)}>
                  <QuestionCircleOutlined />
                </Tooltip>
              </span>
            }
          >
            <PaymentsEditor
              methods={methods}
              creditMethod={creditMethod}
              allowCredit={Boolean(party)}
              total={totals.total}
              value={payments}
              onChange={setPayments}
              creditLabel={t(`OnAccount.${side}.${type}`)}
            />
            {isSale && zatcaActive && (
              <div className="pur-line__code mt-2">{t("ZatcaWillSend")}</div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title={tP("Totals")} className="mb-3">
            <TotalsSummary totals={totals} taxMode="exclusive" />
          </Card>
          <Space wrap>
            <Button
              type="primary"
              size="large"
              icon={<SaveOutlined />}
              loading={saving === "save"}
              disabled={Boolean(saving) || !lines.length || overInvoice}
              onClick={() => save("save")}
            >
              {t("Save")}
            </Button>
            <SavePrintButtons
              onSave={save}
              saving={saving}
              disabled={!lines.length || overInvoice}
            />
            {!isEdit && (
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
            )}
          </Space>
        </Col>
      </Row>

      {/* أسباب الإشعار: إضافة / تعديل / حذف */}
      <NoteReasonsModal
        open={reasonsModal}
        onClose={() => setReasonsModal(false)}
        items={reasons}
        onChange={setReasons}
        type={type}
        onPick={(r) => {
          setReason(r.label);
          setReasonEn(r.enLabel ?? "");
          setReasonsModal(false);
        }}
      />
      {/* البنود المضافة: بند جديد / إدارة */}
      <NoteLineItemsModal
        open={itemsModal}
        onClose={() => setItemsModal(false)}
        items={customItems}
        onChange={setCustomItems}
        type={type}
        onAdded={(item) => {
          setCustomItems((prev) =>
            prev.some((x) => x.id === item.id) ? prev : [...prev, item],
          );
          setItemsModal(false);
          // السطر بيتضاف بعد ما القائمة تتحدث (اسم البند)
          setLines((prev) => [
            ...prev,
            {
              key: newKey(),
              kind: item.key,
              description: item.arName,
              descriptionEn: item.enName || item.arName,
              product: null,
              unitId: null,
              qty: 1,
              price: null,
              tax: defaultTax.value,
            },
          ]);
        }}
      />
    </div>
  );
}

// ============================================================
// اختيار صنف لسطر تصحيح السعر: أصناف الفاتورة أولاً، والبحث في كل الأصناف
// value / onChange: { id, code, arName, enName, taxRate, units, fromInvoice? }
// ============================================================
function ProductSelect({ value, invoiceProducts, onChange }) {
  const locale = useLocale();
  const t = useTranslations("Notes");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const reqId = useRef(0);
  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);

  const search = (q) => {
    clearTimeout(timer.current);
    const text = q.trim();
    if (!text) return setResults([]);
    timer.current = setTimeout(async () => {
      const id = ++reqId.current;
      setLoading(true);
      const res = await searchNoteProductsAction(text);
      if (id !== reqId.current) return;
      setLoading(false);
      if (res.success)
        setResults(
          res.data.map((p) => ({
            key: `p${p.id}`,
            id: p.id,
            code: p.code,
            arName: p.arName,
            enName: p.enName,
            taxRate: p.taxRate,
            units: p.units.map((u) => ({ unit: u.unit, factor: u.factor })),
          })),
        );
    }, 300);
  };

  const all = [
    ...invoiceProducts,
    ...results.filter((r) => !invoiceProducts.some((i) => i.id === r.id)),
  ];
  const byKey = new Map(all.map((p) => [p.key, p]));
  if (value && !byKey.has(value.key)) byKey.set(value.key, value);

  const option = (p) => ({
    value: p.key,
    label: `${p.code} - ${nameOf(p)}`,
  });

  return (
    <Select
      showSearch
      size="small"
      style={{ width: "100%" }}
      placeholder={t("ChooseProduct")}
      filterOption={false}
      loading={loading}
      value={value?.key}
      onSearch={search}
      onChange={(key) => onChange(byKey.get(key) ?? null)}
      options={[
        ...(invoiceProducts.length
          ? [
              {
                label: t("InvoiceItems"),
                options: invoiceProducts.map(option),
              },
            ]
          : []),
        ...(results.length
          ? [
              {
                label: t("SearchResults"),
                options: results
                  .filter((r) => !invoiceProducts.some((i) => i.id === r.id))
                  .map(option),
              },
            ]
          : []),
        ...(value && !all.some((p) => p.key === value.key)
          ? [option(value)]
          : []),
      ]}
    />
  );
}

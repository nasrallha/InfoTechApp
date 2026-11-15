"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Tag,
} from "antd";
import {
  DeleteOutlined,
  FilePdfOutlined,
  PlusOutlined,
  PrinterOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import PageHeader from "@/components/common/PageHeader";
import ClientOnly from "@/components/common/ClientOnly";
import SearchBox from "@/components/common/SearchBox";
import DayPicker from "@/components/common/DayPicker";
import SavedDocPrint from "@/components/printing/SavedDocPrint";
import { SAVE_PRINT_THERMAL } from "@/lib/print-param";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { addDays } from "@/lib/rent";
import { formatDate, today } from "@/lib/dates";
import { KINSHIPS } from "@/lib/tailoring";
import { C } from "@/lib/theme";
import {
  createTailorOrderAction,
  getTailorOrderAction,
  updateTailorOrderAction,
  findTailorCustomerByPhoneAction,
  getTailorCustomerAction,
  previewTailorOrderAction,
  searchTailorCustomersAction,
} from "@/actions/tailoring.actions";
import MeasuresGrid from "./MeasuresGrid";
import StylePicker from "./StylePicker";
import TailorOrderCard, { LiveTailorCard } from "./TailorOrderCard";
import CardActions from "./CardActions";
import CustomerResults from "./CustomerResults";
import "./tailoring.css";

// ============================================================
// طلب تفصيل جديد
// 1) العميل: بالجوال (أو الاسم / الكود) - مش موجود ← عميل جديد بالجوال والاسم
// 2) لكل شخص (هو / ابنه ...) سطر: المقاسات (آخر مقاس، أو أقدم) + تفاصيل التفصيلة
//    بالصور + القماش بالمتر + عدد الثياب وسعر التفصيل
// 3) موعد التسليم والخياط + العربون (أو الكل / ولا حاجة) ← الفاتورة آجل بالعربون
// بعد الحفظ: الشاشة بتفضل (طلب جديد) وكارت الطلب بيتطبع
// ============================================================
let seq = 0;
const newKey = () => `l${++seq}`;

export default function TailorOrderForm({
  options,
  paymentMethods = [],
  initialCustomer = null,
  // تعديل طلب موجود (من getTailorOrderForEdit) - نفس الرقم والفاتورة
  editOrder = null,
}) {
  const router = useRouter();
  const t = useTranslations("Tailoring");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const nameOf = (x) =>
    x ? (locale === "ar" ? x.arName : x.enName || x.arName) : "";

  const blankLine = (person = null) => {
    const last = person?.measurements?.[0] ?? null;
    return {
      key: newKey(),
      personId: person?.id ?? null,
      personName: "",
      kinship: "self",
      measurementId: last?.id ?? null,
      measures: { ...(last?.measures ?? {}) },
      styles: {},
      fabricId: null,
      fabricQty: null,
      fabricPrice: 0,
      pieces: 1,
      sewPrice: options.sewPrice,
      notes: "",
    };
  };

  // ---------------- العميل ----------------
  const [search, setSearch] = useState("");
  const [finding, setFinding] = useState(false);
  const [results, setResults] = useState(null);
  const [customer, setCustomer] = useState(initialCustomer);
  // الشاشة بتفتح جاهزة على «عميل جديد» (الاسم والجوال) والتفصيل تحت -
  // ولو العميل موجود: البحث فوق بيجيبه بأشخاصه ومقاساته
  const [newCustomer, setNewCustomer] = useState(
    initialCustomer || editOrder ? null : { phone: "", name: "" },
  ); // { phone, name }

  // ---------------- السطور والطلب ----------------
  const [lines, setLines] = useState(() =>
    editOrder
      ? editOrder.lines.map((l) => ({ ...l, key: newKey(), kinship: "self" }))
      : initialCustomer
        ? [blankLine(initialCustomer.persons.find((p) => p.isActive) ?? null)]
        : [blankLine()],
  );
  const ep = editOrder?.payment;
  const [deliveryDate, setDeliveryDate] = useState(
    editOrder?.deliveryDate ?? addDays(today(), options.deliveryDays ?? 7),
  );
  const [technicianId, setTechnicianId] = useState(
    editOrder?.technicianId ?? null,
  );
  const [notes, setNotes] = useState(editOrder?.notes ?? "");
  // التعديل: العربون / المدفوع بالكامل / من غير دفع زي ما كان
  const [payMode, setPayMode] = useState(
    !editOrder
      ? "deposit"
      : !ep
        ? "none"
        : ep.amount >= editOrder.total - 0.009
          ? "full"
          : "deposit",
  );
  // خصم على الطلب كله (مبلغ أو نسبة) ← خصم الفاتورة
  const [discountType, setDiscountType] = useState(
    editOrder?.discountType ?? "amount",
  );
  const [discountValue, setDiscountValue] = useState(
    editOrder?.discountValue ?? 0,
  );
  const [methodId, setMethodId] = useState(
    ep?.paymentMethodId ?? paymentMethods[0]?.id ?? null,
  );
  const [payAmount, setPayAmount] = useState(
    ep && ep.amount < (editOrder?.total ?? 0) - 0.009 ? ep.amount : null,
  );
  const [reference, setReference] = useState(ep?.reference ?? "");
  const [total, setTotal] = useState(null);
  // سبب فشل حساب الإجمالي (نفس اللي هيمنع الحفظ)
  const [previewError, setPreviewError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null); // { id, docNo, saleId }
  const [printJob, setPrintJob] = useState(null);
  // كارت الطلب بعد طباعة الفاتورة (أوتوماتيك)
  const [cardJob, setCardJob] = useState(null);
  // نافذة «تم حفظ الطلب» بأزرار الطباعة
  const [doneOpen, setDoneOpen] = useState(false);

  const persons = useMemo(
    () => (customer?.persons ?? []).filter((p) => p.isActive),
    [customer],
  );
  const personById = useMemo(
    () => new Map(persons.map((p) => [p.id, p])),
    [persons],
  );
  const fabricById = useMemo(
    () => new Map(options.fabrics.map((f) => [f.id, f])),
    [options.fabrics],
  );
  const needsRef = paymentMethods.find(
    (m) => m.id === methodId,
  )?.requiresReference;
  const hasCustomer = Boolean(customer || newCustomer);

  const setLine = (key, patch) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const pickCustomer = (c) => {
    setCustomer(c);
    setNewCustomer(null);
    setResults(null);
    setLines([blankLine(c.persons.find((p) => p.isActive) ?? null)]);
  };

  const find = async (value) => {
    const q = value.trim();
    if (!q) return;
    setFinding(true);
    try {
      // جوال ← العميل بالجوال، أو عميل جديد بنفس الجوال
      if (/^\d{9,11}$/.test(q)) {
        const res = await findTailorCustomerByPhoneAction(q);
        if (!res.success) return showActionError(res, tAlerts, locale);
        if (res.data) return pickCustomer(res.data);
        message.info(t("CustomerNotFoundAdd"));
        return startNew(q);
      }
      const res = await searchTailorCustomersAction({ q });
      if (!res.success) return showActionError(res, tAlerts, locale);
      if (res.data.length === 1) {
        const one = await getTailorCustomerAction(res.data[0].id);
        if (one.success && one.data) return pickCustomer(one.data);
      }
      setResults(res.data);
    } finally {
      setFinding(false);
    }
  };

  // عميل جديد: الاسم والجوال (الاتنين لازم)
  const startNew = (phone = "") => {
    setCustomer(null);
    setResults(null);
    setNewCustomer({ phone, name: "" });
    setLines([blankLine()]);
  };
  const newPhoneOk = /^\d{9,11}$/.test(newCustomer?.phone ?? "");
  const newNameOk = Boolean(newCustomer?.name?.trim());

  const choose = async (id) => {
    const res = await getTailorCustomerAction(id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    if (res.data) pickCustomer(res.data);
  };

  // اسم الشخص الجديد: لو فاضي و«العميل نفسه» ← اسم العميل
  const personNameOf = (l) =>
    l.personName.trim() ||
    (l.kinship === "self"
      ? (newCustomer?.name ?? (customer ? nameOf(customer) : ""))
      : "");

  // ---------------- بيانات الحفظ ----------------
  const payload = () => ({
    customerId: customer?.id ?? null,
    phone: newCustomer?.phone ?? null,
    customerName: newCustomer?.name ?? null,
    deliveryDate,
    technicianId,
    notes,
    discountType,
    discountValue: discountValue ?? 0,
    lines: lines.map((l) => ({
      personId: l.personId,
      personName: l.personId ? null : personNameOf(l),
      kinship: l.kinship,
      measurementId: l.measurementId,
      measures: l.measures,
      styles: Object.entries(l.styles).map(([groupId, choiceIds]) => ({
        groupId: Number(groupId),
        choiceIds,
      })),
      fabricId: l.fabricId,
      fabricQty: l.fabricId ? (l.fabricQty ?? 0) : 0,
      fabricPrice: l.fabricId ? (l.fabricPrice ?? 0) : 0,
      pieces: l.pieces ?? 1,
      sewPrice: l.sewPrice ?? 0,
      notes: l.notes,
    })),
  });

  // الإجمالي شامل الضريبة (نفس حساب الفاتورة) - بعد ما الكتابة تقف
  const previewKey = JSON.stringify(
    lines
      .map((l) => [
        l.fabricId,
        l.fabricQty,
        l.fabricPrice,
        l.pieces,
        l.sewPrice,
        l.personId,
        l.personName,
      ])
      .concat([[discountType, discountValue]]),
  );
  useEffect(() => {
    if (!hasCustomer || !lines.length) return;
    let alive = true;
    const timer = setTimeout(async () => {
      const res = await previewTailorOrderAction({
        ...payload(),
        payment: null,
      });
      if (!alive) return;
      setTotal(res.success ? res.data.total : null);
      setPreviewError(res.success ? null : res);
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, hasCustomer]);

  const paid =
    payMode === "none"
      ? 0
      : payMode === "full"
        ? (total ?? 0)
        : (payAmount ?? 0);

  // طلب جديد: نفس الشاشة جاهزة تاني (عميل جديد + سطر فاضي)
  const reset = () => {
    setCustomer(null);
    setNewCustomer({ phone: "", name: "" });
    setResults(null);
    setSearch("");
    setLines([blankLine()]);
    setNotes("");
    setTechnicianId(null);
    setPayMode("deposit");
    setPayAmount(null);
    setReference("");
    setDiscountType("amount");
    setDiscountValue(0);
    setTotal(null);
    setDeliveryDate(addDays(today(), options.deliveryDays ?? 7));
  };

  const save = async () => {
    if (newCustomer && (!newNameOk || !newPhoneOk))
      return message.error(t("NewCustomerRequired"));
    if (payMode !== "none" && paid > 0 && !methodId)
      return message.error(tAlerts("PaymentMethodNotFound"));
    if (total != null && paid > total + 0.009)
      return message.error(t("PaidOverTotal"));
    setSaving(true);
    const save = editOrder ? updateTailorOrderAction : createTailorOrderAction;
    const res = await save({
      ...payload(),
      ...(editOrder
        ? { id: editOrder.id }
        : { requestId: crypto.randomUUID() }),
      payment:
        payMode === "none" || !(paid > 0)
          ? null
          : {
              paymentMethodId: methodId,
              amount: paid,
              reference: reference || null,
            },
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("OrderSaved", { no: res.data.docNo }));
    // التعديل ← شاشة الطلب
    if (editOrder) return router.push(`/tailoring/${editOrder.id}`);
    setSaved(res.data);
    reset();
    // نافذة: طباعة الفاتورة (كاشير) / طباعة الطلب (الكارت A4 للخياط)
    setDoneOpen(true);
  };

  // بعد ما الطباعة تخلص ← شريط «الفاتورة جاهزة للطباعة» بيختفي لوحده
  const printInvoice = (saleId) => {
    window.addEventListener(
      "afterprint",
      () => setTimeout(() => setPrintJob(null), 500),
      {
        once: true,
      },
    );
    setPrintJob({
      kind: "sale",
      id: saleId,
      mode: SAVE_PRINT_THERMAL,
      text: t("InvoiceReady"),
      seq: Date.now(),
    });
  };
  // «طلب تفصيل جديد»: الشاشة نضيفة (من غير شرايط الطلب اللي فات)
  const startNewOrder = () => {
    setDoneOpen(false);
    setSaved(null);
    setPrintJob(null);
  };
  const printCard = async (orderId, pdf = false) => {
    const o = await getTailorOrderAction(orderId);
    if (!o.success) return showActionError(o, tAlerts, locale);
    setCardJob({ order: o.data, pdf, seq: Date.now() });
  };

  // العلامة على رسمة في الكارت (نفس اختيار الصور في السطر)
  const toggleFromCard = (key, g, id) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const cur = l.styles[String(g.id)] ?? [];
        const has = cur.includes(id);
        const next = g.multiple
          ? has
            ? cur.filter((x) => x !== id)
            : [...cur, id]
          : has
            ? []
            : [id];
        return { ...l, styles: { ...l.styles, [String(g.id)]: next } };
      }),
    );

  // ---------------- المعاينة: الطلب من اللي على الشاشة ----------------
  const previewOrder = () => {
    const tech = options.technicians.find((x) => x.id === technicianId);
    const estimate = lines.reduce(
      (s, l) =>
        s +
        (l.fabricId ? (l.fabricQty ?? 0) * (l.fabricPrice ?? 0) : 0) +
        (l.pieces ?? 0) * (l.sewPrice ?? 0),
      0,
    );
    const sum = total ?? estimate;
    return {
      docNo: null,
      orderDate: new Date().toISOString(),
      deliveryDate,
      customer: customer ?? {
        arName: newCustomer?.name ?? "",
        enName: newCustomer?.name ?? "",
        phone: newCustomer?.phone,
      },
      technician: tech ?? null,
      pieces: lines.reduce((s, l) => s + (l.pieces ?? 0), 0),
      notes,
      total: sum,
      paid,
      due: Math.max(0, sum - paid),
      lines: lines.map((l) => {
        const fabric = l.fabricId ? fabricById.get(l.fabricId) : null;
        return {
          id: l.key,
          personName:
            (l.personId ? personById.get(l.personId)?.name : personNameOf(l)) ||
            "—",
          pieces: l.pieces ?? 1,
          fabricName: fabric ? nameOf(fabric) : null,
          fabricQty: l.fabricQty ?? 0,
          notes: l.notes,
          measures: options.fields
            .filter((f) => String(l.measures[String(f.id)] ?? "").trim())
            .map((f) => ({ ...f, value: l.measures[String(f.id)] })),
          styles: options.groups
            .map((g) => ({
              ...g,
              choices: g.choices.filter((c) =>
                (l.styles[String(g.id)] ?? []).includes(c.id),
              ),
            }))
            .filter((g) => g.choices.length),
        };
      }),
    };
  };

  // ---------------- سطر شخص ----------------
  const personOptions = [
    ...persons.map((p) => ({
      value: p.id,
      label: `${p.name} (${t(`kin_${p.kinship}`)})`,
    })),
    { value: "new", label: t("NewPerson") },
  ];

  const renderLine = (l, i) => {
    const person = l.personId ? personById.get(l.personId) : null;
    const fabric = l.fabricId ? fabricById.get(l.fabricId) : null;
    const lineTotal =
      (l.fabricId ? (l.fabricQty ?? 0) * (l.fabricPrice ?? 0) : 0) +
      (l.pieces ?? 0) * (l.sewPrice ?? 0);
    return (
      <div key={l.key} className="tailor-line">
        <div className="tailor-line__head">
          <Tag color="blue">{i + 1}</Tag>
          <div style={{ minWidth: 220 }}>
            <div className="text-xs text-slate-500 mb-1">{t("Person")}</div>
            <Select
              style={{ width: "100%" }}
              value={l.personId ?? "new"}
              options={personOptions}
              onChange={(v) => {
                if (v === "new")
                  return setLine(l.key, { ...blankLine(), key: l.key });
                const p = personById.get(v);
                const last = p?.measurements?.[0];
                setLine(l.key, {
                  personId: v,
                  measurementId: last?.id ?? null,
                  measures: { ...(last?.measures ?? {}) },
                });
              }}
            />
          </div>
          {!l.personId && (
            <>
              <div style={{ minWidth: 200 }}>
                <div className="text-xs text-slate-500 mb-1">
                  {t("PersonName")}
                </div>
                <Input
                  autoComplete="off"
                  maxLength={150}
                  value={l.personName}
                  status={!l.personName.trim() ? "warning" : undefined}
                  onChange={(e) =>
                    setLine(l.key, { personName: e.target.value })
                  }
                />
              </div>
              <div style={{ minWidth: 130 }}>
                <div className="text-xs text-slate-500 mb-1">
                  {t("Kinship")}
                </div>
                <Select
                  style={{ width: "100%" }}
                  value={l.kinship}
                  options={KINSHIPS.map((k) => ({
                    value: k,
                    label: t(`kin_${k}`),
                  }))}
                  onChange={(v) => setLine(l.key, { kinship: v })}
                />
              </div>
            </>
          )}
          {person?.measurements?.length > 0 && (
            <div style={{ minWidth: 200 }}>
              <div className="text-xs text-slate-500 mb-1">
                {t("MeasurementOf")}
              </div>
              <Select
                style={{ width: "100%" }}
                value={l.measurementId}
                options={person.measurements.map((m, k) => ({
                  value: m.id,
                  label: `${formatDate(m.createdAt)}${k === 0 ? ` (${t("Latest")})` : ""}`,
                }))}
                onChange={(v) => {
                  const m = person.measurements.find((x) => x.id === v);
                  setLine(l.key, {
                    measurementId: v,
                    measures: { ...(m?.measures ?? {}) },
                  });
                }}
              />
            </div>
          )}
          <div className="flex-1" />
          {lines.length > 1 && (
            <Button
              danger
              icon={<DeleteOutlined />}
              title={t("RemovePerson")}
              onClick={() =>
                setLines((ls) => ls.filter((x) => x.key !== l.key))
              }
            />
          )}
        </div>

        <div className="tailor-section">{t("Measurements")}</div>
        <MeasuresGrid
          fields={options.fields}
          value={l.measures}
          onChange={(v) => setLine(l.key, { measures: v })}
        />

        {options.groups.length > 0 && (
          <>
            <div className="tailor-section">{t("Styles")}</div>
            <StylePicker
              groups={options.groups}
              value={l.styles}
              onChange={(v) => setLine(l.key, { styles: v })}
            />
          </>
        )}

        <div className="tailor-section">{t("FabricAndPrice")}</div>
        <Row gutter={[8, 8]}>
          <Col xs={24} md={8}>
            <div className="text-xs text-slate-500 mb-1">{t("Fabric")}</div>
            <Select
              allowClear
              style={{ width: "100%" }}
              placeholder={t("NoFabric")}
              value={l.fabricId ?? undefined}
              showSearch={{ optionFilterProp: "label" }}
              options={options.fabrics.map((f) => ({
                value: f.id,
                label: `${f.code} - ${nameOf(f)} (${money(f.price)})`,
              }))}
              onChange={(v) => {
                const f = v ? fabricById.get(v) : null;
                setLine(l.key, {
                  fabricId: v ?? null,
                  fabricPrice: f?.price ?? 0,
                  fabricQty: f ? (l.fabricQty ?? null) : null,
                });
              }}
            />
          </Col>
          <Col xs={8} md={3}>
            <div className="text-xs text-slate-500 mb-1">
              {t("FabricQty")} {fabric ? `(${nameOf(fabric.baseUnit)})` : ""}
            </div>
            <InputNumber
              style={{ width: "100%" }}
              min={0}
              disabled={!l.fabricId}
              value={l.fabricQty}
              status={l.fabricId && !(l.fabricQty > 0) ? "warning" : undefined}
              onChange={(v) => setLine(l.key, { fabricQty: v })}
            />
          </Col>
          <Col xs={8} md={3}>
            <div className="text-xs text-slate-500 mb-1">
              {t("FabricPrice")}
            </div>
            <InputNumber
              style={{ width: "100%" }}
              min={0}
              disabled={!l.fabricId}
              value={l.fabricPrice}
              onChange={(v) => setLine(l.key, { fabricPrice: v ?? 0 })}
            />
          </Col>
          <Col xs={8} md={2}>
            <div className="text-xs text-slate-500 mb-1">{t("Pieces")}</div>
            <InputNumber
              style={{ width: "100%" }}
              min={1}
              precision={0}
              value={l.pieces}
              onChange={(v) => setLine(l.key, { pieces: v ?? 1 })}
            />
          </Col>
          <Col xs={12} md={3}>
            <div className="text-xs text-slate-500 mb-1">{t("SewPrice")}</div>
            <InputNumber
              style={{ width: "100%" }}
              min={0}
              value={l.sewPrice}
              onChange={(v) => setLine(l.key, { sewPrice: v ?? 0 })}
            />
          </Col>
          <Col xs={12} md={5}>
            <div className="text-xs text-slate-500 mb-1">{t("LineNotes")}</div>
            <Input
              autoComplete="off"
              maxLength={500}
              value={l.notes}
              onChange={(e) => setLine(l.key, { notes: e.target.value })}
            />
          </Col>
        </Row>
        <div className="text-end mt-2 text-slate-500">
          {t("LineSubtotal")}: <b>{money(lineTotal)}</b>
        </div>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title={
          editOrder ? t("EditOrderN", { no: editOrder.docNo }) : t("NewOrder")
        }
        // مسافة صغيرة تحت العنوان (الشاشة أقصر)
        className="mb-2"
      />

      {saved && (
        <Alert
          type="success"
          showIcon
          className="mb-3"
          title={t("OrderSaved", { no: saved.docNo })}
          action={
            <Space wrap>
              <Link href={`/tailoring/${saved.id}`}>{t("OpenOrder")}</Link>
              <CardActions
                size="small"
                orderId={saved.id}
                fields={options.fields}
                groups={options.groups}
              />
              <Button
                size="small"
                icon={<PrinterOutlined />}
                onClick={() => printInvoice(saved.saleId)}
              >
                {t("PrintInvoice")}
              </Button>
            </Space>
          }
          closable={{ onClose: () => setSaved(null) }}
        />
      )}

      {/* ---------------- العميل ---------------- */}
      <Card size="small" className="mb-3">
        <Row gutter={[12, 8]} align="bottom">
          <Col xs={24} md={10}>
            <SearchBox
              placeholder={t("FindCustomer")}
              value={search}
              loading={finding}
              onChange={setSearch}
              onSearch={find}
            />
          </Col>
          {customer && (
            <Col xs={24} md={11}>
              <Space wrap size={16}>
                <span>
                  <b>{nameOf(customer)}</b>{" "}
                  <bdi className="text-slate-500">({customer.code})</bdi>
                </span>
                {customer.phone && <bdi>{customer.phone}</bdi>}
                <span className="text-slate-500">
                  {t("PersonsN", { n: persons.length })}
                </span>
              </Space>
            </Col>
          )}
          {newCustomer && (
            <>
              <Col xs={24} md={6}>
                <div className="text-xs text-slate-500 mb-1">
                  <span style={{ color: C.danger }}>* </span>
                  {t("NewCustomerName")}
                </div>
                <Input
                  autoComplete="off"
                  maxLength={255}
                  status={!newNameOk ? "error" : undefined}
                  value={newCustomer.name}
                  onChange={(e) =>
                    setNewCustomer((c) => ({ ...c, name: e.target.value }))
                  }
                />
              </Col>
              <Col xs={24} md={5}>
                <div className="text-xs text-slate-500 mb-1">
                  <span style={{ color: C.danger }}>* </span>
                  {t("Phone")}
                </div>
                <Input
                  dir="ltr"
                  autoComplete="off"
                  maxLength={11}
                  status={!newPhoneOk ? "error" : undefined}
                  value={newCustomer.phone}
                  onChange={(e) =>
                    setNewCustomer((c) => ({
                      ...c,
                      phone: e.target.value.replace(/\D/g, ""),
                    }))
                  }
                />
              </Col>
            </>
          )}
        </Row>
        {results && <CustomerResults results={results} onPick={choose} />}
        {!hasCustomer && !results && (
          <div className="text-slate-500 mt-2">{t("FindCustomerHint")}</div>
        )}
      </Card>

      {hasCustomer && (
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={12}>
            {/* ---------------- الأشخاص ---------------- */}
            {lines.map(renderLine)}
            <Button
              icon={<PlusOutlined />}
              className="mb-3"
              onClick={() => setLines((ls) => [...ls, blankLine()])}
            >
              {t("AddPerson")}
            </Button>

            {/* ---------------- التسليم والدفع ---------------- */}
            <Card size="small" className="mb-3">
              <Row gutter={[12, 12]}>
                <Col xs={12} md={4}>
                  <div className="text-xs text-slate-500 mb-1">
                    {t("DeliveryDate")}
                  </div>
                  <DayPicker
                    style={{ width: "100%" }}
                    value={deliveryDate}
                    min={today()}
                    onChange={setDeliveryDate}
                  />
                </Col>
                <Col xs={12} md={5}>
                  <div className="text-xs text-slate-500 mb-1">
                    {t("Tailor")}
                  </div>
                  <Select
                    allowClear
                    style={{ width: "100%" }}
                    placeholder={t("NoTailor")}
                    value={technicianId ?? undefined}
                    options={options.technicians.map((x) => ({
                      value: x.id,
                      label: nameOf(x),
                    }))}
                    onChange={(v) => setTechnicianId(v ?? null)}
                  />
                </Col>
                <Col xs={24} md={15}>
                  <div className="text-xs text-slate-500 mb-1">
                    {t("Notes")}
                  </div>
                  <Input
                    autoComplete="off"
                    maxLength={1000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </Col>
                <Col xs={24} md={8}>
                  <div className="text-xs text-slate-500 mb-1">
                    {t("Discount")}
                  </div>
                  <Space.Compact style={{ width: "100%" }}>
                    <Select
                      style={{ width: 110 }}
                      value={discountType}
                      onChange={setDiscountType}
                      options={[
                        { value: "amount", label: t("DiscountAmount") },
                        { value: "percent", label: t("DiscountPercent") },
                      ]}
                    />
                    <InputNumber
                      style={{ width: "100%" }}
                      min={0}
                      max={discountType === "percent" ? 100 : undefined}
                      value={discountValue}
                      onChange={(v) => setDiscountValue(v ?? 0)}
                    />
                  </Space.Compact>
                </Col>
                <Col xs={24} md={16}>
                  <div className="text-xs text-slate-500 mb-1">
                    {t("Payment")}
                  </div>
                  <Segmented
                    block
                    value={payMode}
                    onChange={setPayMode}
                    options={[
                      { value: "deposit", label: t("PayDeposit") },
                      { value: "full", label: t("PayFull") },
                      { value: "none", label: t("PayNone") },
                    ]}
                  />
                </Col>
                {payMode !== "none" && (
                  <>
                    <Col xs={12} md={5}>
                      <div className="text-xs text-slate-500 mb-1">
                        {t("PaymentMethod")}
                      </div>
                      <Select
                        style={{ width: "100%" }}
                        value={methodId ?? undefined}
                        options={paymentMethods.map((m) => ({
                          value: m.id,
                          label: nameOf(m),
                        }))}
                        onChange={setMethodId}
                      />
                    </Col>
                    {payMode === "deposit" && (
                      <Col xs={12} md={4}>
                        <div className="text-xs text-slate-500 mb-1">
                          {t("DepositAmount")}
                        </div>
                        <InputNumber
                          style={{ width: "100%" }}
                          min={0}
                          value={payAmount}
                          onChange={setPayAmount}
                        />
                      </Col>
                    )}
                    {needsRef && (
                      <Col xs={12} md={6}>
                        <div className="text-xs text-slate-500 mb-1">
                          {t("Reference")}
                        </div>
                        <Input
                          dir="ltr"
                          maxLength={100}
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                        />
                      </Col>
                    )}
                  </>
                )}
              </Row>
              {previewError &&
                !["RequiredField", "ValidationError"].includes(
                  previewError.error,
                ) && (
                  <Alert
                    type="error"
                    showIcon
                    className="mt-3"
                    title={
                      tAlerts.has(previewError.error)
                        ? tAlerts(
                            previewError.error,
                            previewError.details ?? {},
                          )
                        : previewError.error
                    }
                  />
                )}
              <Row gutter={[12, 12]} className="mt-3">
                <Col xs={8}>
                  <Statistic
                    title={t("TotalWithTax")}
                    value={total == null ? "—" : money(total)}
                  />
                </Col>
                <Col xs={8}>
                  <Statistic
                    title={t("Paid")}
                    value={money(paid)}
                    styles={{ content: { color: C.successText } }}
                  />
                </Col>
                <Col xs={8}>
                  <Statistic
                    title={t("Due")}
                    value={
                      total == null ? "—" : money(Math.max(0, total - paid))
                    }
                    styles={{ content: { color: C.dangerText } }}
                  />
                </Col>
              </Row>
            </Card>

            <div className="flex justify-end gap-2 mb-6">
              <Button onClick={reset}>{t("Clear")}</Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving}
                onClick={save}
              >
                {t("SaveOrder")}
              </Button>
            </div>
          </Col>
          {/* الكارت مرسوم قدامك وبيتحدث مع كل اختيار - والضغط على رسمة بيعلّم عليها */}
          <Col xs={24} xl={12}>
            <div className="tailor-live-col">
              <div className="text-xs text-slate-500 mb-1">
                {t("LiveCardHint")}
              </div>
              <LiveTailorCard
                order={previewOrder()}
                fields={options.fields}
                groups={options.groups}
                onToggle={toggleFromCard}
              />
            </div>
          </Col>
        </Row>
      )}

      <SavedDocPrint job={printJob} onClose={() => setPrintJob(null)} />
      {cardJob && (
        <TailorOrderCard
          key={cardJob.seq}
          order={cardJob.order}
          fields={options.fields}
          groups={options.groups}
          pdf={cardJob.pdf}
          onDone={() => setCardJob(null)}
        />
      )}
      {/* بعد إتمام الطلب: طباعة الفاتورة / طباعة الطلب */}
      <ClientOnly>
        <Modal
          open={doneOpen && Boolean(saved)}
          title={saved ? t("OrderSaved", { no: saved.docNo }) : ""}
          onCancel={startNewOrder}
          footer={
            <Button type="primary" onClick={startNewOrder}>
              {t("NewOrder")}
            </Button>
          }
          width={480}
        >
          {saved && (
            <div className="flex flex-col gap-3 py-2">
              <Button
                type="primary"
                size="large"
                block
                icon={<PrinterOutlined />}
                onClick={() => printInvoice(saved.saleId)}
              >
                {t("PrintInvoice")}
              </Button>
              <Button
                type="primary"
                size="large"
                block
                icon={<PrinterOutlined />}
                onClick={() => printCard(saved.id)}
              >
                {t("PrintOrder")}
              </Button>
              <Button
                block
                icon={<FilePdfOutlined />}
                onClick={() => printCard(saved.id, true)}
              >
                {t("CardPdf")}
              </Button>
            </div>
          )}
        </Modal>
      </ClientOnly>
    </div>
  );
}

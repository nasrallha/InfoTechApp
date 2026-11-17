"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Col,
  Descriptions,
  Input,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Tooltip,
} from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import DayPicker from "@/components/common/DayPicker";
import ClientOnly from "@/components/common/ClientOnly";
import {
  addPaymentAction,
  advancePreviewAction,
  createChangeOrderAction,
  issueAdvanceAction,
  updateAdvanceAction,
} from "@/actions/contracting.actions";
import { itemAmount } from "@/lib/contracting";
import { round } from "@/lib/invoice-calc";
import { qtyText } from "@/lib/unit-qty";
import { today } from "@/lib/dates";
import { C } from "@/lib/theme";

const Label = ({ text, hint }) => (
  <div className="text-xs text-slate-500 mb-1">
    {text}
    {hint && (
      <Tooltip title={hint}>
        <QuestionCircleOutlined className="ms-1" />
      </Tooltip>
    )}
  </div>
);

// ============================================================
// فاتورة الدفعة المقدمة: المبلغ + الضريبة = الإجمالي + السداد عليها (زي فواتير دفعات الإيجار)
// - مدفوعة بالكامل / سداد جزئي (الباقي آجل يتحصّل بسند) / آجل على الطرف
// - edit: تعديل الفاتورة بنفس رقمها (القيمة + السداد) - صلاحية «تعديل فاتورة الدفعة»
// - عقد الباطن: رقم فاتورة مقاول الباطن
// methods: طرق الدفع (من غير «آجل») | الأب بيركّبها وقت الفتح بس (القيم الأولية من غير effect)
// ============================================================
export function AdvanceModal({ contract: c, methods = [], edit = false, onClose, onDone }) {
  const t = useTranslations("Contracting");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money, decimals } = useCurrency();
  const doc = c.advanceDoc;
  const nameOf = (m) => (locale === "ar" ? m.arName : m.enName || m.arName);
  // السداد الحالي (التعديل)
  const initialStatus = !edit || !doc
    ? "full"
    : !doc.payment
      ? "credit"
      : doc.paid >= doc.totalAmount - 1e-9
        ? "full"
        : "partial";
  const [status, setStatus] = useState(initialStatus);
  const [methodId, setMethodId] = useState(doc?.payment?.paymentMethodId ?? methods[0]?.id ?? null);
  const [reference, setReference] = useState(doc?.payment?.reference ?? "");
  const [paidAmount, setPaidAmount] = useState(initialStatus === "partial" ? doc.paid : null);
  const [amount, setAmount] = useState(c.position.advanceAmount);
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const needsRef = methods.find((m) => m.id === methodId)?.requiresReference;

  // الإجمالي شامل الضريبة (نفس حساب الفاتورة) - التعديل: بالقيمة الجديدة بعد ما الكتابة تقف
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(
      () => {
        advancePreviewAction({ id: c.id, amount: edit && amount > 0 ? amount : null }).then((res) => {
          if (alive) setPreview(res.success ? res.data : null);
        });
      },
      edit ? 400 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [c.id, edit, amount]);

  const save = async () => {
    const pays = status !== "credit";
    if (pays && !methodId) return message.error(tAlerts("RequiredField"));
    if (pays && needsRef && !reference.trim()) return message.error(tAlerts("RequiredField"));
    if (status === "partial" && !(paidAmount > 0 && paidAmount <= (preview?.total ?? 0)))
      return message.error(t("PaidNowRange", { total: money(preview?.total ?? 0) }));
    setSaving(true);
    const action = edit ? updateAdvanceAction : issueAdvanceAction;
    const res = await action({
      contractId: c.id,
      supplierInvoiceNo: supplierInvoiceNo || null,
      paymentMethodId: pays ? methodId : null,
      reference: pays ? reference || null : null,
      paidAmount: status === "partial" ? paidAmount : null,
      ...(edit ? { amount } : {}),
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t(edit ? "AdvanceUpdated" : "AdvanceIssued"));
    onDone?.(res.data);
    onClose();
  };

  return (
    <ClientOnly>
      <Modal
        open
        title={edit ? `${t("EditAdvance")} ${doc?.docNo ?? ""}` : t("IssueAdvance")}
        onCancel={onClose}
        onOk={save}
        okText={edit ? t("SaveChanges") : t("IssueInvoice")}
        okButtonProps={{ disabled: !preview }}
        confirmLoading={saving}
        mask={{ closable: false }}
        width={620}
      >
        <Spin spinning={!preview}>
          <Descriptions
            size="small"
            bordered
            column={1}
            className="mb-3"
            items={[
              ...(edit ? [] : [{ key: "p", label: t("AdvancePct"), children: `${c.advancePct}%` }]),
              ...(edit ? [] : [{ key: "a", label: t("AdvanceAmount"), children: money(preview?.amount ?? 0) }]),
              { key: "t", label: `${t("Vat")} ${c.taxRate}%`, children: money(preview?.tax ?? 0) },
              { key: "g", label: t("InvoiceTotal"), children: <b>{money(preview?.total ?? 0)}</b> },
            ]}
          />
        </Spin>
        <Row gutter={[12, 8]}>
          {edit && (
            <Col xs={24}>
              <Label text={t("AdvanceAmount")} hint={t("EditAdvanceHint")} />
              <InputNumber
                min={0.01}
                precision={decimals}
                style={{ width: "100%" }}
                value={amount}
                onChange={(v) => setAmount(v ?? 0)}
              />
            </Col>
          )}
          {c.kind === "sub" && (
            <Col xs={24}>
              <Label text={t("SupplierInvoiceNo")} hint={t("SupplierInvoiceNoHint")} />
              <Input value={supplierInvoiceNo} maxLength={50} dir="ltr" onChange={(e) => setSupplierInvoiceNo(e.target.value)} />
            </Col>
          )}
          <Col xs={24}>
            <Label text={t("PaymentStatus")} />
            <Segmented
              block
              value={status}
              onChange={setStatus}
              options={[
                { value: "full", label: t("PaidFull") },
                { value: "partial", label: t("PaidPartial") },
                { value: "credit", label: t("OnCredit") },
              ]}
            />
          </Col>
          {status !== "credit" && (
            <>
              <Col xs={24} md={status === "partial" ? 8 : 12}>
                <Label text={t("PaymentMethod")} />
                <Select
                  style={{ width: "100%" }}
                  value={methodId ?? undefined}
                  onChange={setMethodId}
                  options={methods.map((m) => ({ value: m.id, label: nameOf(m) }))}
                />
              </Col>
              {status === "partial" && (
                <Col xs={24} md={8}>
                  <Label text={t("PaidNow")} hint={t("PaidNowHint")} />
                  <InputNumber
                    min={0}
                    precision={decimals}
                    style={{ width: "100%" }}
                    value={paidAmount}
                    onChange={(v) => setPaidAmount(v ?? null)}
                  />
                </Col>
              )}
              {needsRef && (
                <Col xs={24} md={status === "partial" ? 8 : 12}>
                  <Label text={t("Reference")} />
                  <Input value={reference} maxLength={100} dir="ltr" onChange={(e) => setReference(e.target.value)} />
                </Col>
              )}
            </>
          )}
        </Row>
        <Alert className="mt-3" type="info" showIcon title={t("AdvancePayHint")} />
      </Modal>
    </ClientOnly>
  );
}

// ============================================================
// التحصيل من المالك (سند قبض) / السداد لمقاول الباطن (سند صرف)
// kind: payment دفعة | retention إفراج عن حجز الضمان (بحد أقصى المحجوز)
// ============================================================
export function PaymentModal({ contract: c, methods, initialKind = "payment", onClose }) {
  const t = useTranslations("Contracting");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money, decimals } = useCurrency();
  const pos = c.position;
  const [kind, setKind] = useState(initialKind);
  const [methodId, setMethodId] = useState(methods[0]?.id ?? null);
  const [amount, setAmount] = useState(null);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const nameOf = (m) => (locale === "ar" ? m.arName : m.enName || m.arName);

  // المبلغ المقترح: المستحق بعد الضمان / الضمان المحجوز
  const suggested =
    kind === "retention"
      ? pos.retentionLeft
      : round(Math.max(0, pos.due - pos.retentionLeft), decimals);

  const save = async () => {
    const value = amount ?? suggested;
    if (!(value > 0)) return message.error(tAlerts("MustBePositive"));
    if (!methodId) return message.error(tAlerts("PaymentMethodNotFound"));
    setSaving(true);
    const res = await addPaymentAction({
      contractId: c.id,
      kind,
      paymentMethodId: methodId,
      amount: value,
      reference: reference || null,
      notes: notes || null,
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("PaymentSaved"));
    onClose();
  };

  return (
    <ClientOnly>
      <Modal
        open
        title={c.kind === "sub" ? t("PayToSub") : t("CollectFromOwner")}
        onCancel={onClose}
        onOk={save}
        confirmLoading={saving}
        mask={{ closable: false }}
        destroyOnHidden
      >
        <Segmented
          block
          className="mb-3"
          value={kind}
          onChange={setKind}
          options={[
            { value: "payment", label: t("pay_payment") },
            { value: "retention", label: t("pay_retention"), disabled: !(pos.retentionLeft > 0) },
          ]}
        />
        <Row gutter={[12, 8]}>
          <Col xs={24} md={12}>
            <Label text={t("PaymentMethod")} />
            <Select
              style={{ width: "100%" }}
              value={methodId ?? undefined}
              onChange={setMethodId}
              options={methods.map((m) => ({ value: m.id, label: nameOf(m) }))}
            />
          </Col>
          <Col xs={24} md={12}>
            <Label text={t("Amount")} hint={kind === "retention" ? t("RetentionLeftHint") : t("DueHint")} />
            <InputNumber
              min={0}
              style={{ width: "100%" }}
              value={amount}
              placeholder={money(suggested)}
              onChange={setAmount}
            />
          </Col>
          <Col xs={24} md={12}>
            <Label text={t("Reference")} />
            <Input value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
          </Col>
          <Col xs={24} md={12}>
            <Label text={t("Notes")} />
            <Input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
          </Col>
        </Row>
        <div className="mt-3 text-xs text-slate-500">
          {kind === "retention"
            ? t("RetentionLeftIs", { v: money(pos.retentionLeft) })
            : t("DueIs", { v: money(pos.due) })}
        </div>
      </Modal>
    </ClientOnly>
  );
}

// ============================================================
// أمر التغيير: تعديل كمية بند (+ زيادة / - نقص) أو بند جديد بسعره
// الكمية بعد النقص مينفعش تقل عن المنفّذ
// ============================================================
let keySeq = 0;
export function ChangeOrderModal({ contract: c, onClose }) {
  const t = useTranslations("Contracting");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money, decimals } = useCurrency();
  const [date, setDate] = useState(today());
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);
  const byId = new Map(c.items.map((it) => [it.id, it]));

  const add = (isNew) =>
    setLines((l) => [
      ...l,
      { key: `c${++keySeq}`, isNew, itemId: null, itemNo: "", description: "", unitName: "", qtyDelta: 0, price: 0 },
    ]);
  const setLine = (key, patch) => setLines((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const priceOf = (l) => (l.isNew ? l.price : (byId.get(l.itemId)?.price ?? 0));
  const diff = round(lines.reduce((s, l) => s + itemAmount(l.qtyDelta, priceOf(l), decimals), 0), decimals);

  const save = async () => {
    if (!title.trim()) return message.error(t("ChangeTitleRequired"));
    const list = lines.filter((l) => l.qtyDelta && (l.isNew ? l.description.trim() : l.itemId));
    if (!list.length) return message.error(tAlerts("NoItems"));
    setSaving(true);
    const res = await createChangeOrderAction({
      contractId: c.id,
      date,
      title,
      notes: notes || null,
      lines: list.map((l) => ({
        itemId: l.isNew ? null : l.itemId,
        itemNo: l.itemNo || null,
        description: l.isNew ? l.description : null,
        unitName: l.unitName || null,
        qtyDelta: l.qtyDelta,
        price: l.isNew ? l.price : priceOf(l),
      })),
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("ChangeSaved"));
    onClose();
  };

  const columns = [
    {
      title: t("Item"),
      key: "i",
      width: 330,
      render: (_, l) =>
        l.isNew ? (
          <Space.Compact style={{ width: "100%" }}>
            <Input
              style={{ width: 70 }}
              placeholder={t("ItemNo")}
              value={l.itemNo}
              maxLength={30}
              onChange={(e) => setLine(l.key, { itemNo: e.target.value })}
            />
            <Input
              placeholder={t("ItemDescription")}
              value={l.description}
              maxLength={500}
              onChange={(e) => setLine(l.key, { description: e.target.value })}
            />
          </Space.Compact>
        ) : (
          <Select
            style={{ width: "100%" }}
            value={l.itemId ?? undefined}
            placeholder={t("ChooseItem")}
            showSearch={{ optionFilterProp: "label" }}
            onChange={(v) => setLine(l.key, { itemId: v })}
            options={c.items.map((it) => ({
              value: it.id,
              label: `${it.itemNo ? `${it.itemNo} - ` : ""}${it.description}`,
            }))}
          />
        ),
    },
    {
      title: t("Unit"),
      key: "u",
      width: 80,
      render: (_, l) =>
        l.isNew ? (
          <Input value={l.unitName} maxLength={30} onChange={(e) => setLine(l.key, { unitName: e.target.value })} />
        ) : (
          byId.get(l.itemId)?.unitName ?? "—"
        ),
    },
    {
      title: (
        <span>
          {t("QtyChange")}
          <Tooltip title={t("QtyChangeHint")}>
            <QuestionCircleOutlined className="ms-1" />
          </Tooltip>
        </span>
      ),
      key: "q",
      width: 120,
      render: (_, l) => (
        <InputNumber
          precision={3}
          min={l.isNew ? 0 : undefined}
          style={{ width: "100%" }}
          value={l.qtyDelta}
          onChange={(v) => setLine(l.key, { qtyDelta: v ?? 0 })}
        />
      ),
    },
    {
      title: t("UnitPrice"),
      key: "p",
      width: 120,
      render: (_, l) =>
        l.isNew ? (
          <InputNumber min={0} precision={4} style={{ width: "100%" }} value={l.price} onChange={(v) => setLine(l.key, { price: v ?? 0 })} />
        ) : (
          money(priceOf(l))
        ),
    },
    {
      title: t("CurrentQty"),
      key: "cq",
      width: 100,
      align: "center",
      render: (_, l) => {
        const it = byId.get(l.itemId);
        return it ? `${qtyText(it.qty)} → ${qtyText(round(it.qty + (l.qtyDelta || 0), 3))}` : "—";
      },
    },
    {
      title: t("Amount"),
      key: "a",
      width: 120,
      align: "end",
      render: (_, l) => {
        const v = itemAmount(l.qtyDelta, priceOf(l), decimals);
        return <span style={{ color: v < 0 ? C.dangerText : undefined }}>{money(v)}</span>;
      },
    },
    {
      title: "",
      key: "d",
      width: 46,
      align: "center",
      render: (_, l) => (
        <Button
          size="small"
          danger
          aria-label={t("Delete")}
          title={t("Delete")}
          icon={<DeleteOutlined />}
          onClick={() => setLines((x) => x.filter((y) => y.key !== l.key))}
        />
      ),
    },
  ];

  return (
    <ClientOnly>
      <Modal
        open
        title={t("NewChangeOrder")}
        onCancel={onClose}
        onOk={save}
        confirmLoading={saving}
        width={980}
        mask={{ closable: false }}
        destroyOnHidden
      >
        <Row gutter={[12, 8]} className="mb-3">
          <Col xs={12} md={5}>
            <Label text={t("Date")} />
            <DayPicker value={date} onChange={(v) => v && setDate(v)} />
          </Col>
          <Col xs={24} md={10}>
            <Label text={t("ChangeTitle")} />
            <Input value={title} maxLength={255} onChange={(e) => setTitle(e.target.value)} />
          </Col>
          <Col xs={24} md={9}>
            <Label text={t("Notes")} />
            <Input value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
          </Col>
        </Row>
        <Space className="mb-2" wrap>
          <Button icon={<EditOutlined />} onClick={() => add(false)}>
            {t("ChangeExistingItem")}
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => add(true)}>
            {t("AddNewItem")}
          </Button>
        </Space>
        <Table
          size="small"
          bordered
          rowKey="key"
          pagination={false}
          dataSource={lines}
          columns={columns}
          tableLayout="fixed"
          scroll={{ x: columns.reduce((s, x) => s + x.width, 0) }}
          locale={{ emptyText: t("NoChangeLines") }}
        />
        <div className="mt-3 font-bold">
          {t("ContractValueChange")}:{" "}
          <span style={{ color: diff < 0 ? C.dangerText : C.successText }}>{money(diff)}</span>
          <span className="text-xs text-slate-500"> ({t("BeforeTax")})</span>
        </div>
      </Modal>
    </ClientOnly>
  );
}

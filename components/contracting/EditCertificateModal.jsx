"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Card, Col, Input, InputNumber, Modal, Row, Segmented, Select, Space, Spin, Table, Tooltip } from "antd";
import { DeleteOutlined, PlusOutlined, QuestionCircleOutlined, RollbackOutlined, SaveOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import ClientOnly from "@/components/common/ClientOnly";
import { getCertificateAction, updateCertificateAction } from "@/actions/contracting.actions";
import { certificateCalc, itemAmount } from "@/lib/contracting";
import { purchaseDocNo, saleDocNo } from "@/lib/doc-number";
import { round } from "@/lib/invoice-calc";
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

let keySeq = 0;
const newKey = () => `e${++keySeq}`;

// ============================================================
// تعديل المستخلص وفاتورته بنفس رقمها (صلاحية «تعديل فاتورة الدفعة»)
// - حالة السداد (مدفوع بالكامل = الصافي / جزئي / آجل) وطريقة الدفع
// - الاسترداد والضمان ورقم المستخلص عند العميل والملاحظات
// - البنود: المستخلص بالمبلغ الإجمالي / السريع بس (بالكميات: من بنود العقد زي ما هي)
// - الفاتورة الموقّعة للزكاة أو اللي عليها سندات: السيرفر بيرفض (التصحيح بمرتجع / إشعار)
// certId: المستخلص | methods: طرق الدفع (من غير «آجل») | units: الوحدات المتسجلة
// invoiceMode: «تعديل الفاتورة» (صفحة): السداد والملاحظات بس، وأرقام المستخلص للعرض
// الأب بيركّبها وقت الفتح بس (القيم من المستخلص نفسه)
// ============================================================
export default function EditCertificateModal({ certId, methods = [], units = [], onClose, onDone, invoiceMode = false }) {
  const t = useTranslations("Contracting");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money, decimals } = useCurrency();
  const [cert, setCert] = useState(null);
  const [lines, setLines] = useState([]);
  const [recovery, setRecovery] = useState(0);
  const [retention, setRetention] = useState(0);
  const [clientRef, setClientRef] = useState("");
  const [notes, setNotes] = useState("");
  const [payStatus, setPayStatus] = useState("credit");
  const [methodId, setMethodId] = useState(methods[0]?.id ?? null);
  const [paidAmount, setPaidAmount] = useState(null);
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const nameOf = (m) => (locale === "ar" ? m.arName : m.enName || m.arName);
  const unitOptions = units.map((u) => ({ value: u.id, label: nameOf(u) }));
  const needsRef = methods.find((m) => m.id === methodId)?.requiresReference;

  // المستخلص الحالي ← القيم الأولية
  useEffect(() => {
    let alive = true;
    getCertificateAction(certId).then((res) => {
      if (!alive) return;
      if (!res.success || !res.data) {
        showActionError(res, tAlerts, locale);
        return onClose();
      }
      const x = res.data;
      setCert(x);
      setLines(
        x.extra.map((l) => ({
          key: newKey(),
          description: l.description,
          unitId: units.find((u) => u.arName === l.unitName)?.id ?? null,
          unitName: l.unitName ?? "",
          qty: l.qty,
          price: l.price,
        })),
      );
      setRecovery(x.recovery);
      setRetention(x.retention);
      setClientRef(x.clientRef ?? "");
      setNotes(x.notes ?? "");
      const inv = x.invoice;
      if (inv?.payment) {
        setMethodId(inv.payment.paymentMethodId);
        setReference(inv.payment.reference ?? "");
        const full = inv.paid >= x.netPayable - 0.009;
        setPayStatus(full ? "full" : "partial");
        setPaidAmount(full ? null : inv.paid);
      } else setPayStatus("credit");
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certId]);

  // البنود قابلة للتعديل: المستخلص بالمبلغ الإجمالي / السريع (من غير بنود العقد) - مش في تعديل الفاتورة
  const editLines = Boolean(cert) && cert.rows.length === 0 && !invoiceMode;
  const invoiceNo = cert?.invoice
    ? cert.invoice.sub
      ? purchaseDocNo(cert.invoice.type, cert.invoice.number, cert.invoice.docCode)
      : saleDocNo(cert.invoice.type, cert.invoice.number, cert.invoice.docCode)
    : "";
  const amounts = editLines ? lines.map((l) => itemAmount(l.qty, l.price, decimals)) : [cert?.gross ?? 0];
  const gross = round(amounts.reduce((s, a) => s + a, 0), decimals);
  const calc = certificateCalc({
    amounts,
    contract: { recoveryPct: 0, retentionPct: 0, taxRate: cert?.taxRate ?? 0 },
    advanceLeft: gross,
    recovery,
    retention,
    penalty: cert?.penalty ?? 0,
    decimals,
  });
  const paidNow = payStatus === "partial" ? Number(paidAmount) || 0 : payStatus === "full" ? Math.max(0, calc.net) : 0;

  const setLine = (key, patch) => setLines((list) => list.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = async () => {
    if (!(calc.gross > 0)) return message.error(tAlerts("CertNoWorks"));
    if (calc.net < 0) return message.error(tAlerts("CertNetNegative"));
    const pays = payStatus !== "credit";
    if (pays && !methodId) return message.error(tAlerts("RequiredField"));
    if (pays && needsRef && !reference.trim()) return message.error(tAlerts("RequiredField"));
    if (payStatus === "partial" && !(paidAmount > 0 && paidAmount <= calc.net))
      return message.error(t("PaidNowRange", { total: money(calc.net) }));
    setSaving(true);
    const res = await updateCertificateAction({
      id: certId,
      lines: editLines
        ? lines
            .filter((l) => l.description.trim() && l.qty > 0)
            .map((l) => ({
              description: l.description.trim(),
              unitName: l.unitName || null,
              unitId: l.unitId ?? null,
              qty: Number(l.qty) || 0,
              price: Number(l.price) || 0,
            }))
        : null,
      recovery: Number(recovery) || 0,
      retention: Number(retention) || 0,
      clientRef: clientRef || null,
      notes: notes || null,
      paymentMethodId: pays ? methodId : null,
      reference: pays ? reference || null : null,
      paidAmount: payStatus === "partial" ? paidAmount : null,
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t(invoiceMode ? "InvoiceUpdated" : "CertUpdated"));
    onDone?.(res.data);
    if (!invoiceMode) onClose();
  };

  const lineColumns = [
    {
      title: t("ItemDescription"),
      key: "d",
      width: 260,
      render: (_, l) => <Input value={l.description} maxLength={500} onChange={(e) => setLine(l.key, { description: e.target.value })} />,
    },
    {
      title: t("Unit"),
      key: "u",
      width: 130,
      render: (_, l) => (
        <Select
          allowClear
          style={{ width: "100%" }}
          value={l.unitId ?? undefined}
          placeholder={t("ServiceUnit")}
          showSearch={{ optionFilterProp: "label" }}
          options={unitOptions}
          onChange={(v) => setLine(l.key, { unitId: v ?? null, unitName: units.find((u) => u.id === v)?.arName ?? "" })}
        />
      ),
    },
    {
      title: t("Qty"),
      key: "q",
      width: 100,
      render: (_, l) => (
        <InputNumber min={0} precision={3} style={{ width: "100%" }} value={l.qty} onChange={(v) => setLine(l.key, { qty: v ?? 0 })} />
      ),
    },
    {
      title: t("UnitPrice"),
      key: "p",
      width: 120,
      render: (_, l) => (
        <InputNumber min={0} precision={4} style={{ width: "100%" }} value={l.price} onChange={(v) => setLine(l.key, { price: v ?? 0 })} />
      ),
    },
    { title: t("Amount"), key: "a", width: 110, align: "end", render: (_, l) => money(itemAmount(l.qty, l.price, decimals)) },
    {
      title: "",
      key: "x",
      width: 44,
      align: "center",
      render: (_, l) =>
        lines.length > 1 && (
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

  const sum = [
    [t("WorksThisCert"), calc.gross],
    [t("AdvanceRecovery"), -calc.recovery],
    [`${t("Vat")} ${cert?.taxRate ?? 0}%`, calc.tax],
    [t("InvoiceTotal"), calc.invoiceTotal, "bold"],
    [t("Retention"), -calc.retention],
    ...(calc.penalty > 0 ? [[t("DelayPenalty"), -calc.penalty]] : []),
    [t("NetPayable"), calc.net, "net"],
  ];

  const body = (
    <>
      {!cert ? (
        <div className="py-6 text-center">
          <Spin />
        </div>
      ) : (
        <>
          {invoiceMode ? (
            <Alert type="info" showIcon className="mb-2" title={t("EditInvoiceHint")} />
          ) : editLines ? (
            <>
              <Table
                size="small"
                bordered
                rowKey="key"
                pagination={false}
                dataSource={lines}
                columns={lineColumns}
                scroll={{ x: lineColumns.reduce((s, c) => s + c.width, 0) }}
              />
              <Button size="small" className="mt-2" icon={<PlusOutlined />} onClick={() => setLines((l) => [...l, { key: newKey(), description: "", unitId: null, unitName: "", qty: 1, price: 0 }])}>
                {t("AddLine")}
              </Button>
            </>
          ) : (
            <Alert type="info" showIcon className="mb-2" title={t("EditQtyCertHint")} />
          )}
          {!invoiceMode && (
          <Row gutter={[12, 8]} className="mt-3">
            <Col xs={12} md={6}>
              <Label text={t("AdvanceRecovery")} />
              <InputNumber min={0} precision={decimals} style={{ width: "100%" }} value={recovery} onChange={(v) => setRecovery(v ?? 0)} />
            </Col>
            <Col xs={12} md={6}>
              <Label text={t("Retention")} />
              <InputNumber min={0} precision={decimals} style={{ width: "100%" }} value={retention} onChange={(v) => setRetention(v ?? 0)} />
            </Col>
            <Col xs={12} md={6}>
              <Label text={t("ClientRef")} />
              <Input value={clientRef} maxLength={60} dir="ltr" onChange={(e) => setClientRef(e.target.value)} />
            </Col>
            <Col xs={12} md={6}>
              <Label text={t("Notes")} />
              <Input value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
            </Col>
          </Row>
          )}
          <Row gutter={[16, 8]} className="mt-3">
            <Col xs={24} md={12}>
              <Label text={t("PaymentStatus")} hint={t("CertPayHint")} />
              <Segmented
                block
                value={payStatus}
                onChange={setPayStatus}
                options={[
                  { value: "full", label: t("PaidFull") },
                  { value: "partial", label: t("PaidPartial") },
                  { value: "credit", label: t("OnCredit") },
                ]}
              />
              {payStatus !== "credit" && (
                <Space orientation="vertical" size={6} className="w-full mt-2">
                  <Select
                    style={{ width: "100%" }}
                    value={methodId ?? undefined}
                    onChange={setMethodId}
                    placeholder={t("PaymentMethod")}
                    options={methods.map((m) => ({ value: m.id, label: nameOf(m) }))}
                  />
                  {payStatus === "partial" && (
                    <InputNumber
                      min={0}
                      max={calc.net}
                      precision={decimals}
                      style={{ width: "100%" }}
                      placeholder={t("PaidNow")}
                      value={paidAmount}
                      onChange={(v) => setPaidAmount(v ?? null)}
                    />
                  )}
                  {needsRef && (
                    <Input maxLength={100} dir="ltr" placeholder={t("Reference")} value={reference} onChange={(e) => setReference(e.target.value)} />
                  )}
                </Space>
              )}
              <div className="text-xs text-slate-500 mt-2">
                {t("PaidNow")}: <b>{money(paidNow)}</b> — {t("LeftOnInvoice")}:{" "}
                <b>{money(Math.max(0, calc.invoiceTotal - calc.penalty - paidNow))}</b>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <table className="w-full">
                <tbody>
                  {sum.map(([label, v, kind]) => (
                    <tr key={label} style={kind === "net" ? { borderTop: `2px solid ${C.primary}` } : undefined}>
                      <td className="py-1">{label}</td>
                      <td className="py-1" style={{ textAlign: "end" }}>
                        <span
                          className={kind ? "font-bold" : undefined}
                          style={kind === "net" ? { fontSize: 17, color: C.primary } : v < 0 ? { color: C.dangerText } : undefined}
                        >
                          {money(v)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Col>
          </Row>
          {/* تعديل الفاتورة: الملاحظات */}
          {invoiceMode && (
            <div className="mt-3">
              <Label text={t("Notes")} />
              <Input value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
            </div>
          )}
          <Alert type="warning" showIcon className="mt-3" title={t(invoiceMode ? "EditInvoiceLockHint" : "EditCertHint")} />
        </>
      )}
    </>
  );

  // تعديل الفاتورة: صفحة (السداد والملاحظات)، وأرقام المستخلص للعرض
  if (invoiceMode)
    return (
      <Card
        size="small"
        title={cert ? `${t("EditInvoiceTitle")} ${invoiceNo} — ${t("Certificate")} ${cert.docNo}` : t("EditInvoiceTitle")}
        extra={
          <Space wrap>
            <Button icon={<RollbackOutlined />} onClick={onClose}>
              {t("BackToInvoice")}
            </Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!cert} onClick={save}>
              {t("SaveChanges")}
            </Button>
          </Space>
        }
      >
        {body}
      </Card>
    );

  return (
    <ClientOnly>
      <Modal
        open
        title={cert ? `${t("EditCertificate")} ${cert.docNo}` : t("EditCertificate")}
        onCancel={onClose}
        onOk={save}
        okText={t("SaveChanges")}
        okButtonProps={{ disabled: !cert }}
        confirmLoading={saving}
        mask={{ closable: false }}
        width={860}
      >
        {body}
      </Modal>
    </ClientOnly>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Modal,
  Result,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tooltip,
} from "antd";
import {
  DeleteOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  PlusOutlined,
  PrinterOutlined,
  QuestionCircleOutlined,
  SaveOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import DayPicker from "@/components/common/DayPicker";
import QuickAddParty from "@/components/parties/QuickAddParty";
import PrintDocument from "@/components/printing/PrintDocument";
import PdfDocument from "@/components/printing/PdfDocument";
import SavedDocPrint from "@/components/printing/SavedDocPrint";
import { SAVE_PRINT_A4 } from "@/lib/print-param";
import { createQuickCertificateAction, getCertificateAction } from "@/actions/contracting.actions";
import { certificateCalc, itemAmount } from "@/lib/contracting";
import { saleDocNo } from "@/lib/doc-number";
import { round } from "@/lib/invoice-calc";
import { today } from "@/lib/dates";
import { C } from "@/lib/theme";
import CertificatePrint from "./CertificatePrint";
import { exportCertificateExcel } from "./certificateExcel";

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
const newLine = (description = "") => ({ key: `q${++keySeq}`, description, unitName: "", qty: 1, price: 0 });

// ============================================================
// المستخلص السريع (من غير عقد): مدخلات ← مخرجات
// - العميل + رقم المستخلص عنده (اختياري) + التاريخ
// - الأعمال: إجمالي واحد أو بنود (الوصف والوحدة والكمية والسعر)
// - استرداد الدفعة المقدمة وحجز الضمان: نسبة من قيمة الأعمال أو مبلغ
// - الحساب: الأعمال - الاسترداد = الخاضع + الضريبة = الفاتورة - الضمان = الصافي المستحق
// - حالة السداد: مدفوع بالكامل (الصافي) / جزئي / آجل
// - بعد الحفظ: طباعة المستخلص / PDF / Excel / الفاتورة
// options: { parties, taxRate } | paymentMethods: من غير «آجل»
// ============================================================
export default function QuickCertificateForm({ options, paymentMethods = [], units = [], contracts = [] }) {
  const t = useTranslations("Contracting");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const router = useRouter();
  const { amount: money, decimals } = useCurrency();
  const taxRate = options.taxRate;

  const [customerId, setCustomerId] = useState(null);
  // عقود العميل السارية: اختيار عقد ← مستخلص العقد (بنسبه ورصيد دفعته المقدمة)
  const customerContracts = contracts.filter((c) => c.customerId === customerId);
  const [addedParties, setAddedParties] = useState([]);
  const [date, setDate] = useState(today());
  const [clientRef, setClientRef] = useState("");
  const [view, setView] = useState("total"); // total | lines
  const [lines, setLines] = useState(() => [newLine(t("QuickWorksDefault"))]);
  const [recoveryType, setRecoveryType] = useState("pct");
  const [recoveryValue, setRecoveryValue] = useState(0);
  const [retentionType, setRetentionType] = useState("pct");
  const [retentionValue, setRetentionValue] = useState(0);
  const [payStatus, setPayStatus] = useState("full");
  const [methodId, setMethodId] = useState(paymentMethods[0]?.id ?? null);
  const [paidAmount, setPaidAmount] = useState(null);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null); // { id, saleId }
  const [docJob, setDocJob] = useState(null);
  const [printJob, setPrintJob] = useState(null);
  const [busy, setBusy] = useState(null);

  // من غير تكرار: المضاف بيرجع كمان في القائمة بعد تحديث الصفحة
  const parties = useMemo(() => {
    const seen = new Set();
    return [...addedParties, ...options.parties].filter((p) => !seen.has(p.id) && seen.add(p.id));
  }, [addedParties, options.parties]);
  const nameOf = (c) => (locale === "ar" ? c.arName : c.enName || c.arName);
  // الوحدات المتسجلة (متر مربع / متر مكعب ...) - فاضي = خدمة
  const unitOptions = units.map((u) => ({ value: u.id, label: nameOf(u) }));
  const needsRef = paymentMethods.find((m) => m.id === methodId)?.requiresReference;

  // الحساب (نفس حساب السيرفر بالظبط)
  const amounts = lines.map((l) => itemAmount(l.qty, l.price, decimals));
  const gross = round(amounts.reduce((s, a) => s + a, 0), decimals);
  const valueOf = (type, v) => round(type === "pct" ? (gross * (Number(v) || 0)) / 100 : Number(v) || 0, decimals);
  const calc = certificateCalc({
    amounts,
    contract: { recoveryPct: 0, retentionPct: 0, taxRate },
    advanceLeft: gross,
    recovery: valueOf(recoveryType, recoveryValue),
    retention: valueOf(retentionType, retentionValue),
    decimals,
  });
  const paidNow = payStatus === "partial" ? Number(paidAmount) || 0 : payStatus === "full" ? Math.max(0, calc.net) : 0;

  const setLine = (key, patch) => setLines((list) => list.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = async () => {
    if (!customerId) return message.error(t("OwnerRequired"));
    const list = lines.filter((l) => l.description.trim() && l.qty > 0);
    if (!list.length || !(gross > 0)) return message.error(tAlerts("CertNoWorks"));
    if (calc.net < 0) return message.error(tAlerts("CertNetNegative"));
    const pays = payStatus !== "credit";
    if (pays && !methodId) return message.error(tAlerts("RequiredField"));
    if (pays && needsRef && !reference.trim()) return message.error(tAlerts("RequiredField"));
    if (payStatus === "partial" && !(paidAmount > 0 && paidAmount <= calc.net))
      return message.error(t("PaidNowRange", { total: money(calc.net) }));
    setSaving(true);
    const res = await createQuickCertificateAction({
      customerId,
      date,
      clientRef: clientRef || null,
      lines: list.map((l) => ({
        description: l.description.trim(),
        unitName: l.unitName || null,
        unitId: l.unitId ?? null,
        qty: Number(l.qty) || 0,
        price: Number(l.price) || 0,
      })),
      recoveryType,
      recoveryValue: Number(recoveryValue) || 0,
      retentionType,
      retentionValue: Number(retentionValue) || 0,
      paymentMethodId: pays ? methodId : null,
      reference: pays ? reference || null : null,
      paidAmount: payStatus === "partial" ? paidAmount : null,
      notes: notes || null,
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("CertSaved"));
    setDone(res.data);
  };

  // المستخلص للطباعة / PDF / Excel
  const certDoc = async (mode) => {
    setBusy(mode);
    const res = await getCertificateAction(done.id);
    setBusy(null);
    if (!res.success || !res.data) return showActionError(res, tAlerts, locale);
    if (mode === "excel") {
      const inv = res.data.invoice;
      return exportCertificateExcel(res.data, t, {
        locale,
        invoiceNo: inv ? saleDocNo(inv.type, inv.number, inv.docCode) : null,
      });
    }
    setDocJob({ mode, cert: res.data });
  };

  // مستخلص جديد: الفورم من الأول (نفس العميل)
  const reset = () => {
    setDone(null);
    setPrintJob(null);
    setClientRef("");
    setLines([newLine(t("QuickWorksDefault"))]);
    setPaidAmount(null);
    setReference("");
    setNotes("");
  };

  const lineColumns = [
    {
      title: t("ItemDescription"),
      key: "d",
      width: 340,
      render: (_, l) => (
        <Input value={l.description} maxLength={500} onChange={(e) => setLine(l.key, { description: e.target.value })} />
      ),
    },
    {
      title: t("Unit"),
      key: "u",
      width: 140,
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
      width: 110,
      render: (_, l) => (
        <InputNumber min={0} precision={3} style={{ width: "100%" }} value={l.qty} onChange={(v) => setLine(l.key, { qty: v ?? 0 })} />
      ),
    },
    {
      title: t("UnitPrice"),
      key: "p",
      width: 140,
      render: (_, l) => (
        <InputNumber min={0} precision={4} style={{ width: "100%" }} value={l.price} onChange={(v) => setLine(l.key, { price: v ?? 0 })} />
      ),
    },
    { title: t("Amount"), key: "a", width: 130, align: "end", render: (_, l) => money(itemAmount(l.qty, l.price, decimals)) },
    {
      title: "",
      key: "x",
      width: 46,
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

  // خانة نسبة أو مبلغ (الاسترداد / الضمان)
  const pctOrAmount = (type, setType, value, setValue) => (
    <Space.Compact style={{ width: "100%" }}>
      <Select
        style={{ width: 90 }}
        value={type}
        onChange={(v) => {
          setType(v);
          setValue(0);
        }}
        options={[
          { value: "pct", label: "%" },
          { value: "amount", label: t("AmountShort") },
        ]}
      />
      <InputNumber
        min={0}
        max={type === "pct" ? 100 : undefined}
        precision={type === "pct" ? 2 : decimals}
        style={{ width: "100%" }}
        value={value}
        onChange={(v) => setValue(v ?? 0)}
      />
    </Space.Compact>
  );

  const sum = [
    [t("WorksThisCert"), calc.gross],
    [`${t("AdvanceRecovery")}${recoveryType === "pct" && recoveryValue ? ` ${recoveryValue}%` : ""}`, -calc.recovery],
    [t("TaxableAmount"), calc.taxable],
    [`${t("Vat")} ${taxRate}%`, calc.tax],
    [t("InvoiceTotal"), calc.invoiceTotal, "bold"],
    [`${t("Retention")}${retentionType === "pct" && retentionValue ? ` ${retentionValue}%` : ""}`, -calc.retention],
    [t("NetPayable"), calc.net, "net"],
  ];

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">{t("NewQuickCertificate")}</h1>
        <Space wrap>
          <Button icon={<UnorderedListOutlined />} onClick={() => router.push("/contracting/certificates")}>
            {t("AllCertificates")}
          </Button>
          <Button type="primary" size="large" icon={<SaveOutlined />} loading={saving} onClick={save} disabled={Boolean(done)}>
            {t("SaveCertificate")}
          </Button>
        </Space>
      </div>

      <Card size="small" className="mb-3">
        <Row gutter={[12, 8]}>
          <Col xs={24} md={8}>
            <Label text={t("Owner")} />
            <Space.Compact style={{ width: "100%" }}>
              <Select
                style={{ width: "100%" }}
                value={customerId ?? undefined}
                onChange={setCustomerId}
                placeholder={t("ChooseOwner")}
                showSearch={{ optionFilterProp: "label" }}
                options={parties.map((c) => ({
                  value: c.id,
                  label: `${c.code} - ${nameOf(c)}${c.phone ? ` - ${c.phone}` : ""}`,
                }))}
              />
              <QuickAddParty
                kind="customers"
                onCreated={(c) => {
                  setAddedParties((p) => [c, ...p]);
                  setCustomerId(c.id);
                }}
              />
            </Space.Compact>
          </Col>
          {/* العقد (اختياري): عقد ساري للعميل ← مستخلص العقد نفسه */}
          <Col xs={24} md={6}>
            <Label text={t("ContractOptional")} hint={t("ContractOptionalHint")} />
            <Select
              allowClear
              style={{ width: "100%" }}
              disabled={!customerContracts.length}
              placeholder={customerId && !customerContracts.length ? t("NoActiveContracts") : t("WithoutContract")}
              value={undefined}
              onChange={(id) => id && router.push(`/contracting/${id}/certificate`)}
              options={customerContracts.map((c) => ({ value: c.id, label: `${c.docNo} - ${c.projectName}` }))}
            />
          </Col>
          <Col xs={12} md={5}>
            <Label text={t("ClientRef")} hint={t("ClientRefHint")} />
            <Input value={clientRef} maxLength={60} dir="ltr" onChange={(e) => setClientRef(e.target.value)} />
          </Col>
          <Col xs={12} md={5}>
            <Label text={t("CertDate")} />
            <DayPicker value={date} max={today()} onChange={(v) => v && setDate(v)} />
          </Col>
        </Row>
      </Card>

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={16}>
          <Card
            size="small"
            title={t("SimpleCertTitle")}
            extra={
              <Space wrap>
                <Segmented
                  size="small"
                  value={view}
                  onChange={(v) => {
                    setView(v);
                    // الإجمالي: سطر واحد بقيمة البنود كلها
                    if (v === "total")
                      setLines((x) => [{ ...x[0], description: x[0].description, qty: 1, price: gross }]);
                  }}
                  options={[
                    { value: "total", label: t("CertAsTotal") },
                    { value: "lines", label: t("CertAsLines") },
                  ]}
                />
                {view === "lines" && (
                  <Button size="small" icon={<PlusOutlined />} onClick={() => setLines((l) => [...l, newLine()])}>
                    {t("AddLine")}
                  </Button>
                )}
              </Space>
            }
          >
            {view === "total" ? (
              <Row gutter={[12, 8]}>
                <Col xs={24} md={16}>
                  <Label text={t("WorkDescription")} />
                  <Input
                    value={lines[0]?.description ?? ""}
                    maxLength={500}
                    onChange={(e) => setLine(lines[0].key, { description: e.target.value })}
                  />
                </Col>
                <Col xs={24} md={8}>
                  <Label text={t("CertValueBeforeTax")} hint={t("CertValueBeforeTaxHint")} />
                  <InputNumber
                    min={0}
                    precision={decimals}
                    style={{ width: "100%" }}
                    value={lines[0]?.price ?? 0}
                    onChange={(v) => setLine(lines[0].key, { qty: 1, price: v ?? 0 })}
                  />
                </Col>
              </Row>
            ) : (
              <Table
                size="small"
                bordered
                rowKey="key"
                pagination={false}
                dataSource={lines}
                columns={lineColumns}
                scroll={{ x: lineColumns.reduce((s, c) => s + c.width, 0) }}
              />
            )}
            <Row gutter={[12, 8]} className="mt-3">
              <Col xs={24} md={12}>
                <Label text={t("AdvanceRecovery")} hint={t("QuickRecoveryHint")} />
                {pctOrAmount(recoveryType, setRecoveryType, recoveryValue, setRecoveryValue)}
              </Col>
              <Col xs={24} md={12}>
                <Label text={t("Retention")} hint={t("QuickRetentionHint")} />
                {pctOrAmount(retentionType, setRetentionType, retentionValue, setRetentionValue)}
              </Col>
            </Row>
          </Card>
          <Card size="small" className="mt-3">
            <Label text={t("Notes")} />
            <Input.TextArea rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Card>
        </Col>

        {/* الحساب + السداد */}
        <Col xs={24} xl={8}>
          <Card size="small" title={t("CertSummary")} className="h-full">
            <table className="w-full">
              <tbody>
                {sum.map(([label, v, kind]) => (
                  <tr key={label} style={kind === "net" ? { borderTop: `2px solid ${C.primary}` } : undefined}>
                    <td className="py-1">{label}</td>
                    <td className="py-1" style={{ textAlign: "end" }}>
                      <span
                        className={kind ? "font-bold" : undefined}
                        style={kind === "net" ? { fontSize: 18, color: C.primary } : v < 0 ? { color: C.dangerText } : undefined}
                      >
                        {money(v)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-3">
              <Label text={t("PaymentStatus")} hint={t("CertPayHint")} />
              <Segmented
                block
                size="small"
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
                    size="small"
                    style={{ width: "100%" }}
                    value={methodId ?? undefined}
                    onChange={setMethodId}
                    placeholder={t("PaymentMethod")}
                    options={paymentMethods.map((m) => ({ value: m.id, label: nameOf(m) }))}
                  />
                  {payStatus === "partial" && (
                    <InputNumber
                      size="small"
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
                    <Input
                      size="small"
                      maxLength={100}
                      dir="ltr"
                      placeholder={t("Reference")}
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  )}
                </Space>
              )}
              <div className="text-xs text-slate-500 mt-2">
                {t("PaidNow")}: <b>{money(paidNow)}</b>
                {" — "}
                {t("LeftOnInvoice")}: <b>{money(Math.max(0, calc.invoiceTotal - paidNow))}</b>
              </div>
            </div>
            <Alert className="mt-3" type="info" showIcon title={t("QuickCertHint")} />
          </Card>
        </Col>
      </Row>

      {/* بعد الحفظ: الطباعة */}
      <Modal open={Boolean(done)} footer={null} closable={false} mask={{ closable: false }} centered width={560}>
        <Result
          status="success"
          title={done?.docNo ? `${t("QuickCertSaved")} ${done.docNo}` : t("QuickCertSaved")}
          extra={
            <Space wrap className="justify-center">
              <Button type="primary" icon={<PrinterOutlined />} loading={busy === "print"} onClick={() => certDoc("print")}>
                {t("PrintCertificate")}
              </Button>
              <Button danger icon={<FilePdfOutlined />} loading={busy === "pdf"} onClick={() => certDoc("pdf")}>
                {t("CertificatePdf")}
              </Button>
              <Button icon={<FileExcelOutlined />} style={{ color: C.success }} loading={busy === "excel"} onClick={() => certDoc("excel")}>
                {t("CertificateExcel")}
              </Button>
              <Button
                icon={<PrinterOutlined />}
                onClick={() =>
                  setPrintJob({
                    kind: "sale",
                    id: done.saleId,
                    paper: "A4",
                    mode: SAVE_PRINT_A4,
                    text: t("InvoiceReadyToPrint"),
                    seq: (printJob?.seq ?? 0) + 1,
                  })
                }
              >
                {t("PrintInvoice")}
              </Button>
              <Button icon={<PlusOutlined />} onClick={reset}>
                {t("NewQuickCertificate")}
              </Button>
              <Button icon={<UnorderedListOutlined />} onClick={() => router.push("/contracting/certificates")}>
                {t("AllCertificates")}
              </Button>
            </Space>
          }
        />
        <SavedDocPrint job={printJob} onClose={() => setPrintJob(null)} />
      </Modal>

      {docJob?.mode === "print" && (
        <PrintDocument paperSize="A4" onDone={() => setDocJob(null)}>
          <CertificatePrint cert={docJob.cert} />
        </PrintDocument>
      )}
      {docJob?.mode === "pdf" && (
        <PdfDocument paperSize="A4" fileName={`certificate-${docJob.cert.docNo}`} onDone={() => setDocJob(null)}>
          <CertificatePrint cert={docJob.cert} />
        </PdfDocument>
      )}
    </div>
  );
}

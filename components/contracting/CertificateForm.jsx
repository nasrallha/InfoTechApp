"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
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
  FilePdfOutlined,
  PlusOutlined,
  PrinterOutlined,
  QuestionCircleOutlined,
  RollbackOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import DayPicker from "@/components/common/DayPicker";
import PrintDocument from "@/components/printing/PrintDocument";
import PdfDocument from "@/components/printing/PdfDocument";
import SavedDocPrint from "@/components/printing/SavedDocPrint";
import { SAVE_PRINT_A4 } from "@/lib/print-param";
import { createCertificateAction, getCertificateAction } from "@/actions/contracting.actions";
import { certLineAmount, certificateCalc, itemAmount, penaltySuggestion } from "@/lib/contracting";
import { round } from "@/lib/invoice-calc";
import { qtyText } from "@/lib/unit-qty";
import { formatDay, today } from "@/lib/dates";
import { C } from "@/lib/theme";
import CertificatePrint from "./CertificatePrint";

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
const freeLine = () => ({ key: `f${++keySeq}`, description: "", unitName: "", qty: 1, price: 0 });

// ============================================================
// مستخلص جديد
// - بالكميات: كل بند (التعاقدي / المنفّذ قبل كده / الباقي) وتكتب الكمية الحالية
//   + بنود حرة (أعمال إضافية)
// - مبلغ إجمالي: سطر أو أكتر بالوصف والمبلغ
// - الحساب قدامك: الأعمال - استرداد الدفعة المقدمة + الضريبة = الفاتورة - الضمان - الغرامة = الصافي
//   (الاسترداد والضمان بالنسبة من العقد، وتقدر تعدّلهم)
// - الختامي: يسترد كل باقي الدفعة المقدمة، والعقد بيبقى «منتهي»
// - بعد الحفظ: طباعة المستخلص / PDF / الفاتورة
// ============================================================
export default function CertificateForm({ contract: c, paymentMethods = [], units = [] }) {
  const t = useTranslations("Contracting");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const router = useRouter();
  const { amount: money, decimals } = useCurrency();
  const sub = c.kind === "sub";
  const pos = c.position;
  // الوحدات المتسجلة (متر مربع / متر مكعب ...) للبنود الحرة (فاضي = خدمة)
  const unitOptions = units.map((u) => ({ value: u.id, label: locale === "ar" ? u.arName : u.enName || u.arName }));
  const last = c.certificates[c.certificates.length - 1];
  const seq = (last?.seq ?? 0) + 1;

  // عقد من غير مقايسة: البنود بتتكتب في المستخلص (إجمالي واحد أو بنود)
  const simple = c.items.length === 0;
  const [mode, setMode] = useState(simple ? "lump" : "qty");
  // المختصر: إجمالي واحد للمستخلص كله / بنود تتكتب في المستخلص نفسه
  const [simpleView, setSimpleView] = useState("total");
  const [date, setDate] = useState(today());
  const [periodFrom, setPeriodFrom] = useState(last?.periodTo ?? c.startDate ?? null);
  const [periodTo, setPeriodTo] = useState(today());
  const [isFinal, setIsFinal] = useState(false);
  const [qty, setQty] = useState({}); // itemId ← الكمية الحالية
  const [extra, setExtra] = useState([]); // البنود الحرة (بالكميات)
  const [lump, setLump] = useState([{ ...freeLine(), description: `${t("WorksDoneCert")} ${seq}` }]);
  const [recovery, setRecovery] = useState(null);
  const [retention, setRetention] = useState(null);
  const [penalty, setPenalty] = useState(0);
  // السداد على الفاتورة: مدفوع بالكامل (الصافي المستحق) / جزئي / آجل
  const [payStatus, setPayStatus] = useState("full");
  const [methodId, setMethodId] = useState(paymentMethods[0]?.id ?? null);
  const [paidAmount, setPaidAmount] = useState(null);
  const [reference, setReference] = useState("");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null); // { id, saleId, purchaseId }
  const [docJob, setDocJob] = useState(null);
  const [printJob, setPrintJob] = useState(null);

  // سطور البنود: الباقي والقيمة الحالية
  const rows = useMemo(
    () =>
      c.items.map((it) => {
        const q = Number(qty[it.id]) || 0;
        const left = round(it.qty - it.doneQty, 3);
        return {
          ...it,
          left,
          cur: q,
          curAmount: certLineAmount(it, q, it.doneQty, it.doneAmount, decimals),
          over: q > left + 1e-9,
        };
      }),
    [c.items, qty, decimals],
  );

  const lines =
    mode === "qty"
      ? [
          ...rows.filter((r) => r.cur > 0).map((r) => ({ amount: r.curAmount })),
          ...extra.map((l) => ({ amount: itemAmount(l.qty, l.price, decimals) })),
        ]
      : lump.map((l) => ({ amount: itemAmount(l.qty, l.price, decimals) }));

  const calc = certificateCalc({
    amounts: lines.map((l) => l.amount),
    contract: { recoveryPct: c.recoveryPct, retentionPct: c.retentionPct, taxRate: c.taxRate },
    advanceLeft: pos.advanceLeft,
    isFinal,
    recovery,
    retention,
    penalty,
    decimals,
  });

  // غرامة التأخير المقترحة (التاريخ بعد موعد التسليم)
  const suggestion = penaltySuggestion({
    endDate: c.endDate,
    date,
    perDay: c.penaltyPerDay,
    maxPct: c.penaltyMaxPct,
    total: pos.totalAmount,
    previous: pos.penalties,
    decimals,
  });

  const needsRef = paymentMethods.find((m) => m.id === methodId)?.requiresReference;
  const nameOfMethod = (m) => (locale === "ar" ? m.arName : m.enName || m.arName);

  // كل البنود بالكامل (اختصار للختامي)
  const fillAll = () => {
    const next = {};
    for (const r of rows) if (r.left > 0) next[r.id] = r.left;
    setQty(next);
  };

  const save = async () => {
    if (rows.some((r) => r.over)) return message.error(tAlerts("CertQtyOverContract", { item: "" }));
    if (!(calc.gross > 0)) return message.error(tAlerts("CertNoWorks"));
    if (calc.net < 0) return message.error(tAlerts("CertNetNegative"));
    const pays = payStatus !== "credit";
    if (pays && !methodId) return message.error(tAlerts("RequiredField"));
    if (pays && needsRef && !reference.trim()) return message.error(tAlerts("RequiredField"));
    if (payStatus === "partial" && !(paidAmount > 0 && paidAmount <= calc.net))
      return message.error(t("PaidNowRange", { total: money(calc.net) }));
    setSaving(true);
    const res = await createCertificateAction({
      contractId: c.id,
      date,
      periodFrom,
      periodTo,
      mode,
      isFinal,
      lines:
        mode === "qty"
          ? [
              ...rows.filter((r) => r.cur > 0).map((r) => ({ itemId: r.id, qty: r.cur, price: r.price })),
              ...extra
                .filter((l) => l.description.trim() && l.qty > 0)
                .map((l) => ({ itemId: null, description: l.description.trim(), unitName: l.unitName || null, unitId: l.unitId ?? null, qty: l.qty, price: l.price })),
            ]
          : lump
              .filter((l) => l.description.trim() && l.qty > 0)
              .map((l) => ({ itemId: null, description: l.description.trim(), unitName: l.unitName || null, unitId: l.unitId ?? null, qty: l.qty, price: l.price })),
      recovery,
      retention,
      penalty: penalty || 0,
      supplierInvoiceNo: supplierInvoiceNo || null,
      notes: notes || null,
      paymentMethodId: pays ? methodId : null,
      reference: pays ? reference || null : null,
      paidAmount: payStatus === "partial" ? paidAmount : null,
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("CertSaved"));
    setDone(res.data);
  };

  const certDoc = async (m) => {
    const res = await getCertificateAction(done.id);
    if (!res.success || !res.data) return showActionError(res, tAlerts, locale);
    setDocJob({ mode: m, cert: res.data });
  };

  const freeColumns = (list, setList) => [
    {
      title: t("ItemDescription"),
      key: "d",
      width: 360,
      render: (_, l) => (
        <Input
          value={l.description}
          maxLength={500}
          onChange={(e) => setList((x) => x.map((y) => (y.key === l.key ? { ...y, description: e.target.value } : y)))}
        />
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
          onChange={(v) =>
            setList((x) =>
              x.map((y) => (y.key === l.key ? { ...y, unitId: v ?? null, unitName: units.find((u) => u.id === v)?.arName ?? "" } : y)),
            )
          }
        />
      ),
    },
    {
      title: t("Qty"),
      key: "q",
      width: 110,
      render: (_, l) => (
        <InputNumber
          min={0}
          precision={3}
          style={{ width: "100%" }}
          value={l.qty}
          onChange={(v) => setList((x) => x.map((y) => (y.key === l.key ? { ...y, qty: v ?? 0 } : y)))}
        />
      ),
    },
    {
      title: mode === "lump" && !simple ? t("Amount") : t("UnitPrice"),
      key: "p",
      width: 150,
      render: (_, l) => (
        <InputNumber
          min={0}
          precision={4}
          style={{ width: "100%" }}
          value={l.price}
          onChange={(v) => setList((x) => x.map((y) => (y.key === l.key ? { ...y, price: v ?? 0 } : y)))}
        />
      ),
    },
    { title: t("Amount"), key: "a", width: 130, align: "end", render: (_, l) => money(itemAmount(l.qty, l.price, decimals)) },
    {
      title: "",
      key: "x",
      width: 46,
      align: "center",
      render: (_, l) => (
        <Button
          size="small"
          danger
          aria-label={t("Delete")}
          title={t("Delete")}
          icon={<DeleteOutlined />}
          onClick={() => setList((x) => x.filter((y) => y.key !== l.key))}
        />
      ),
    },
  ];

  const itemColumns = [
    { title: t("ItemNo"), dataIndex: "itemNo", width: 65, align: "center", render: (v, _, i) => v || i + 1 },
    { title: t("ItemDescription"), dataIndex: "description", width: 280 },
    { title: t("Unit"), dataIndex: "unitName", width: 65, align: "center" },
    { title: t("ContractQty"), dataIndex: "qty", width: 95, align: "center", render: (v) => qtyText(v) },
    { title: t("UnitPrice"), dataIndex: "price", width: 105, align: "end", render: (v) => money(v) },
    { title: t("Previous"), dataIndex: "doneQty", width: 90, align: "center", render: (v) => qtyText(v) },
    {
      title: t("LeftQty"),
      dataIndex: "left",
      width: 90,
      align: "center",
      render: (v) => <span style={{ color: v <= 0 ? C.text2 : undefined }}>{qtyText(v)}</span>,
    },
    {
      title: t("CurrentQty"),
      key: "cur",
      width: 120,
      render: (_, r) => (
        <InputNumber
          min={0}
          precision={3}
          disabled={r.left <= 0}
          status={r.over ? "error" : undefined}
          style={{ width: "100%" }}
          value={qty[r.id] ?? null}
          onChange={(v) => setQty((q) => ({ ...q, [r.id]: v ?? 0 }))}
        />
      ),
    },
    {
      title: t("Cumulative"),
      key: "cum",
      width: 90,
      align: "center",
      render: (_, r) => qtyText(round(r.doneQty + r.cur, 3)),
    },
    { title: t("CurrentValue"), dataIndex: "curAmount", width: 120, align: "end", render: (v) => (v ? <b>{money(v)}</b> : "—") },
  ];

  const sum = [
    [t("WorksThisCert"), calc.gross],
    [t("AdvanceRecovery"), -calc.recovery, "recovery"],
    [t("TaxableAmount"), calc.taxable],
    [`${t("Vat")} ${c.taxRate}%`, calc.tax],
    [t("InvoiceTotal"), calc.invoiceTotal, "bold"],
    [`${t("Retention")} ${c.retentionPct}%`, -calc.retention, "retention"],
    [t("DelayPenalty"), -calc.penalty, "penalty"],
    [t("NetPayable"), calc.net, "net"],
  ];

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">
          {t("NewCertificate")} {t("No")} {seq} - <bdi>{c.docNo}</bdi> - {c.projectName}
        </h1>
        <Space wrap>
          <Button icon={<RollbackOutlined />} onClick={() => router.push(`/contracting/${c.id}`)}>
            {t("BackToContract")}
          </Button>
          <Button type="primary" size="large" icon={<SaveOutlined />} loading={saving} onClick={save} disabled={Boolean(done)}>
            {t("SaveCertificate")}
          </Button>
        </Space>
      </div>

      <Card size="small" className="mb-3">
        <Row gutter={[12, 8]} align="bottom">
          {!simple && (
          <Col xs={24} md={6}>
            <Label text={t("CertMode")} hint={t("CertModeHint")} />
            <Segmented
              block
              value={mode}
              onChange={setMode}
              options={[
                { value: "qty", label: t("mode_qty") },
                { value: "lump", label: t("mode_lump") },
              ]}
            />
          </Col>
          )}
          <Col xs={12} md={3}>
            <Label text={t("CertDate")} />
            <DayPicker value={date} max={today()} onChange={(v) => v && setDate(v)} />
          </Col>
          <Col xs={12} md={3}>
            <Label text={t("PeriodFrom")} />
            <DayPicker allowClear value={periodFrom} onChange={(v) => setPeriodFrom(v || null)} />
          </Col>
          <Col xs={12} md={3}>
            <Label text={t("PeriodTo")} />
            <DayPicker allowClear value={periodTo} min={periodFrom} onChange={(v) => setPeriodTo(v || null)} />
          </Col>
          {sub && (
            <Col xs={12} md={4}>
              <Label text={t("SupplierInvoiceNo")} hint={t("SupplierInvoiceNoHint")} />
              <Input value={supplierInvoiceNo} maxLength={50} dir="ltr" onChange={(e) => setSupplierInvoiceNo(e.target.value)} />
            </Col>
          )}
          <Col xs={24} md={sub ? 5 : 9}>
            <Checkbox checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)}>
              {t("FinalCertificate")}
            </Checkbox>
            <Tooltip title={t("FinalHint")}>
              <QuestionCircleOutlined />
            </Tooltip>
          </Col>
        </Row>
      </Card>

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={17}>
          {simple ? (
            <Card
              size="small"
              title={t("SimpleCertTitle")}
              extra={
                <Space wrap>
                  <Segmented
                    size="small"
                    value={simpleView}
                    onChange={(v) => {
                      setSimpleView(v);
                      // الإجمالي: سطر واحد بس
                      if (v === "total") setLump((x) => [{ ...x[0], qty: 1, price: itemAmount(x[0].qty, x[0].price, decimals) }]);
                    }}
                    options={[
                      { value: "total", label: t("CertAsTotal") },
                      { value: "lines", label: t("CertAsLines") },
                    ]}
                  />
                  {simpleView === "lines" && (
                    <Button size="small" icon={<PlusOutlined />} onClick={() => setLump((l) => [...l, freeLine()])}>
                      {t("AddLine")}
                    </Button>
                  )}
                </Space>
              }
            >
              {simpleView === "total" ? (
                <Row gutter={[12, 8]}>
                  <Col xs={24} md={16}>
                    <Label text={t("WorkDescription")} />
                    <Input
                      value={lump[0]?.description ?? ""}
                      maxLength={500}
                      onChange={(e) => setLump((x) => [{ ...x[0], description: e.target.value }])}
                    />
                  </Col>
                  <Col xs={24} md={8}>
                    <Label text={t("CertValueBeforeTax")} hint={t("CertValueBeforeTaxHint")} />
                    <InputNumber
                      min={0}
                      precision={decimals}
                      style={{ width: "100%" }}
                      value={lump[0]?.price ?? 0}
                      onChange={(v) => setLump((x) => [{ ...x[0], qty: 1, price: v ?? 0 }])}
                    />
                  </Col>
                </Row>
              ) : (
                <Table
                  size="small"
                  bordered
                  rowKey="key"
                  pagination={false}
                  dataSource={lump}
                  columns={freeColumns(lump, setLump)}
                  scroll={{ x: 880 }}
                />
              )}
              <Alert className="mt-3" type="info" showIcon title={t("SimpleCertHint")} />
            </Card>
          ) : mode === "qty" ? (
            <Card
              size="small"
              title={t("Boq")}
              extra={
                <Button size="small" onClick={fillAll}>
                  {t("FillAllLeft")}
                </Button>
              }
            >
              <Table
                size="small"
                bordered
                rowKey="id"
                pagination={false}
                dataSource={rows}
                columns={itemColumns}
                tableLayout="fixed"
                scroll={{ x: itemColumns.reduce((s, x) => s + x.width, 0), y: 520 }}
              />
              <div className="flex justify-between items-center mt-3 mb-2">
                <b>{t("ExtraWorks")}</b>
                <Button size="small" icon={<PlusOutlined />} onClick={() => setExtra((l) => [...l, freeLine()])}>
                  {t("AddExtraLine")}
                </Button>
              </div>
              {extra.length > 0 && (
                <Table
                  size="small"
                  bordered
                  rowKey="key"
                  pagination={false}
                  dataSource={extra}
                  columns={freeColumns(extra, setExtra)}
                  scroll={{ x: 880 }}
                />
              )}
            </Card>
          ) : (
            <Card
              size="small"
              title={t("mode_lump")}
              extra={
                <Button size="small" icon={<PlusOutlined />} onClick={() => setLump((l) => [...l, freeLine()])}>
                  {t("AddLine")}
                </Button>
              }
            >
              <Table
                size="small"
                bordered
                rowKey="key"
                pagination={false}
                dataSource={lump}
                columns={freeColumns(lump, setLump)}
                scroll={{ x: 880 }}
              />
              <Alert className="mt-2" type="info" showIcon title={t("LumpHint")} />
            </Card>
          )}
          <Card size="small" className="mt-3">
            <Label text={t("Notes")} />
            <Input.TextArea rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Card>
        </Col>

        {/* الحساب */}
        <Col xs={24} xl={7}>
          <Card size="small" title={t("CertSummary")} className="h-full">
            <table className="w-full">
              <tbody>
                {sum.map(([label, v, kind]) => (
                  <tr key={label} style={kind === "net" ? { borderTop: `2px solid ${C.primary}` } : undefined}>
                    <td className="py-1">
                      {label}
                      {kind === "recovery" && (
                        <div className="text-xs text-slate-500">
                          {pos.advanceIssued || pos.advanceLeft > 0
                            ? t("AdvanceLeftIs", { v: money(pos.advanceLeft) })
                            : pos.advanceAmount > 0
                              ? t("AdvanceNotIssuedHint")
                              : t("NoAdvance")}
                        </div>
                      )}
                    </td>
                    <td className="py-1" style={{ textAlign: "end", width: 150 }}>
                      {kind === "recovery" ? (
                        <InputNumber
                          size="small"
                          min={0}
                          max={pos.advanceLeft}
                          disabled={!(pos.advanceLeft > 0)}
                          style={{ width: 140 }}
                          value={recovery ?? calc.recovery}
                          onChange={(x) => setRecovery(x ?? null)}
                        />
                      ) : kind === "retention" ? (
                        <InputNumber
                          size="small"
                          min={0}
                          style={{ width: 140 }}
                          value={retention ?? calc.retention}
                          onChange={(x) => setRetention(x ?? null)}
                        />
                      ) : kind === "penalty" ? (
                        <InputNumber size="small" min={0} style={{ width: 140 }} value={penalty} onChange={(x) => setPenalty(x ?? 0)} />
                      ) : (
                        <span
                          className={kind === "net" || kind === "bold" ? "font-bold" : undefined}
                          style={kind === "net" ? { fontSize: 18, color: C.primary } : undefined}
                        >
                          {money(v)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(recovery != null || retention != null) && (
              <Button
                size="small"
                type="link"
                onClick={() => {
                  setRecovery(null);
                  setRetention(null);
                }}
              >
                {t("ResetToContractPct")}
              </Button>
            )}
            {/* السداد على الفاتورة */}
            <div className="mt-3">
              <Label text={sub ? t("PaymentStatusSub") : t("PaymentStatus")} hint={t("CertPayHint")} />
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
                    options={paymentMethods.map((m) => ({ value: m.id, label: nameOfMethod(m) }))}
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
                  <div className="text-xs text-slate-500">
                    {t("PaidNow")}: <b>{money(payStatus === "partial" ? paidAmount || 0 : Math.max(0, calc.net))}</b>
                    {" — "}
                    {t("LeftOnInvoice")}:{" "}
                    <b>
                      {money(
                        Math.max(0, calc.invoiceTotal - calc.penalty - (payStatus === "partial" ? paidAmount || 0 : Math.max(0, calc.net))),
                      )}
                    </b>
                  </div>
                </Space>
              )}
            </div>
            {suggestion.amount > 0 && (
              <Alert
                className="mt-2"
                type="warning"
                showIcon
                title={t("PenaltySuggestion", { days: suggestion.days, v: money(suggestion.amount) })}
                action={
                  <Button size="small" onClick={() => setPenalty(suggestion.amount)}>
                    {t("Apply")}
                  </Button>
                }
              />
            )}
            <div className="text-xs text-slate-500 mt-3">{t("CertTaxNote")}</div>
            {c.endDate && (
              <div className="text-xs text-slate-500 mt-1">
                {t("EndDate")}: <bdi>{formatDay(c.endDate)}</bdi>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* بعد الحفظ: الطباعة */}
      <Modal open={Boolean(done)} footer={null} closable={false} mask={{ closable: false }} centered>
        <Result
          status="success"
          title={t("CertSavedTitle", { n: done?.docNo ?? done?.seq ?? seq })}
          extra={
            <Space wrap className="justify-center">
              <Button type="primary" icon={<PrinterOutlined />} onClick={() => certDoc("print")}>
                {t("PrintCertificate")}
              </Button>
              <Button danger icon={<FilePdfOutlined />} onClick={() => certDoc("pdf")}>
                {t("CertificatePdf")}
              </Button>
              <Button
                icon={<PrinterOutlined />}
                onClick={() =>
                  setPrintJob({
                    kind: sub ? "purchase" : "sale",
                    id: done.saleId ?? done.purchaseId,
                    paper: "A4",
                    mode: SAVE_PRINT_A4,
                    text: t("InvoiceReadyToPrint"),
                    seq: Date.now(),
                  })
                }
              >
                {t("PrintInvoice")}
              </Button>
              <Button icon={<RollbackOutlined />} onClick={() => router.push(`/contracting/${c.id}`)}>
                {t("BackToContract")}
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

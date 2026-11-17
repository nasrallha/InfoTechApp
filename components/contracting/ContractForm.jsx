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
  Row,
  Select,
  Space,
  Table,
  Tooltip,
} from "antd";
import {
  DeleteOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
  SnippetsOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import DayPicker from "@/components/common/DayPicker";
import QuickAddParty from "@/components/parties/QuickAddParty";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { saveContractAction } from "@/actions/contracting.actions";
import { formatDay, today } from "@/lib/dates";
import { round } from "@/lib/invoice-calc";
import { contractValues, fillTemplate, itemAmount, parsePastedItems } from "@/lib/contracting";
import ClientOnly from "@/components/common/ClientOnly";

// صيغ خانات العقد في الواجهة (نفس templateFormat في السيرفر) ← المعاينة زي اللي هيتحفظ
export function useContractFormat() {
  const { symbol, decimals } = useCurrency();
  const fixed = (v, d) =>
    Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = (v) => `${fixed(v, decimals)} ${symbol ?? ""}`.trim();
  return {
    money,
    day: (d) => formatDay(d),
    pct: (v) => `${Number(v || 0)}%`,
    row: (it, i) =>
      `${it.itemNo || i + 1}- ${it.description}: ${Number(it.qty)} ${it.unitName ?? ""} × ${fixed(it.price, 2)} = ${money(it.amount)}`,
  };
}

let keySeq = 0;
const newKey = () => `k${++keySeq}`;
const emptyItem = () => ({ key: newKey(), itemNo: "", description: "", unitName: "", qty: 1, price: 0, amount: 0 });

// تسمية الخانة + ❔
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
// عقد مقاولات جديد / تعديل (مع المالك أو مقاول باطن)
// - البيانات والمواعيد + النسب (الدفعة المقدمة والاسترداد والضمان والغرامة)
// - المقايسة: بنود حرة (الإجمالي ← السعر بيتحسب منه، أو الكمية × السعر)
//   + لصق من Excel + نسخ من عقد سابق (?copy=)
// - نص العقد من النموذج بعد ملء الخانات، ويتعدل قبل الحفظ
// - العقد اللي عليه فواتير: البيانات النصية والمواعيد بس (الكميات بأوامر التغيير)
// ============================================================
export default function ContractForm({ options, contract = null, copyFrom = null }) {
  const t = useTranslations("Contracting");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const router = useRouter();
  const { amount: money, decimals } = useCurrency();
  const fmt = useContractFormat();
  const kind = contract?.kind ?? options.kind;
  const sub = kind === "sub";
  const src = contract ?? copyFrom;
  const locked = contract ? !contract.editable : false;

  // قيمة العقد قبل الضريبة (البنود بتتكتب في المستخلص)
  const [contractValue, setContractValue] = useState(src && !src.items?.length ? (src.position?.totalAmount ?? 0) : 0);
  // رصيد دفعة مقدمة اتفوترت قبل كده برّه البرنامج
  const [priorAdvance, setPriorAdvance] = useState(contract?.priorAdvance ?? 0);
  const [partyId, setPartyId] = useState(contract?.party?.id ?? null);
  const [parentId, setParentId] = useState(contract?.parent?.id ?? null);
  const [projectName, setProjectName] = useState(src?.projectName ?? "");
  const [projectLocation, setProjectLocation] = useState(src?.projectLocation ?? "");
  const [refNo, setRefNo] = useState(contract?.refNo ?? "");
  const [signDate, setSignDate] = useState(contract?.signDate ?? today());
  const [startDate, setStartDate] = useState(contract?.startDate ?? null);
  const [endDate, setEndDate] = useState(contract?.endDate ?? null);
  const [pct, setPct] = useState({
    advancePct: src?.advancePct ?? 0,
    recoveryPct: src?.recoveryPct ?? 0,
    retentionPct: src?.retentionPct ?? 0,
    penaltyPerDay: src?.penaltyPerDay ?? 0,
    penaltyMaxPct: src?.penaltyMaxPct ?? 0,
  });
  const [releaseDate, setReleaseDate] = useState(contract?.retentionReleaseDate ?? null);
  const [items, setItems] = useState(() =>
    src?.items?.length
      ? src.items
          .filter((it) => it.qty > 0)
          .map((it) => ({
            key: newKey(),
            id: contract ? it.id : undefined,
            itemNo: it.itemNo ?? "",
            description: it.description,
            unitName: it.unitName ?? "",
            qty: it.qty,
            price: it.price,
            amount: it.amount,
          }))
      : [],
  );
  const [templateId, setTemplateId] = useState(
    contract?.templateId ?? options.templates.find((x) => x.isDefault)?.id ?? options.templates[0]?.id ?? null,
  );
  const [notes, setNotes] = useState(contract?.notes ?? "");
  const [custom, setCustom] = useState(contract?.content ?? null);
  const [saving, setSaving] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  // المالك / المقاول المضاف من زرار الإضافة السريعة (بيتضاف للقائمة ويتختار على طول)
  const [addedParties, setAddedParties] = useState([]);
  // من غير تكرار: المضاف بيرجع كمان في options.parties بعد تحديث الصفحة
  const parties = useMemo(() => {
    const seen = new Set();
    return [...addedParties, ...options.parties].filter((p) => !seen.has(p.id) && seen.add(p.id));
  }, [addedParties, options.parties]);
  const party = parties.find((p) => p.id === partyId) ?? contract?.party ?? null;
  const nameOf = (c) => (locale === "ar" ? c.arName : c.enName || c.arName);
  const taxRate = contract?.taxRate ?? options.taxRate;

  // الإجماليات: القيمة المكتوبة (العقود القديمة اللي ليها مقايسة: مجموع البنود)
  const hasItems = items.length > 0;
  const value = hasItems
    ? round(items.reduce((s, it) => s + (Number(it.amount) || 0), 0), decimals)
    : round(Number(contractValue) || 0, decimals);
  const tax = round((value * taxRate) / 100, decimals);
  const advance = round((value * (pct.advancePct || 0)) / 100, decimals);
  const retentionTotal = round((value * (pct.retentionPct || 0)) / 100, decimals);

  // تعديل بند: الكمية / السعر ← الإجمالي، والإجمالي ← السعر = الإجمالي ÷ الكمية
  const setItem = (key, patch) =>
    setItems((list) =>
      list.map((it) => {
        if (it.key !== key) return it;
        const next = { ...it, ...patch };
        if ("amount" in patch) {
          next.price = next.qty > 0 ? Math.round((next.amount / next.qty) * 10000) / 10000 : 0;
        } else if ("qty" in patch || "price" in patch) {
          next.amount = itemAmount(next.qty, next.price, decimals);
        }
        return next;
      }),
    );

  const applyPaste = (replace) => {
    const rows = parsePastedItems(pasteText);
    if (!rows.length) return message.error(t("PasteNothing"));
    const mapped = rows.map((r) => ({ ...r, key: newKey() }));
    setItems((list) => (replace ? mapped : [...list.filter((x) => x.description), ...mapped]));
    setPasteOpen(false);
    setPasteText("");
    message.success(t("PastedN", { n: rows.length }));
  };

  // نص العقد من النموذج (رقم العقد بيتملي وقت الحفظ)
  const template = options.templates.find((x) => x.id === templateId);
  const generated = useMemo(() => {
    if (!template) return "";
    return fillTemplate(
      template.content,
      contractValues(
        {
          kind,
          docNo: contract?.docNo,
          refNo,
          signDate,
          companyName: options.companyName,
          party: party
            ? {
                name: party.arName,
                idNo: party.idNumber || party.taxNo,
                phone: party.phone,
                address: [party.city, party.district, party.street].filter(Boolean).join(" - "),
              }
            : null,
          projectName,
          projectLocation,
          startDate,
          endDate,
          taxRate,
          ...pct,
          retentionReleaseDate: releaseDate,
          value,
          items: items.filter((it) => it.description),
        },
        fmt,
        decimals,
      ),
    );
  }, [template, kind, contract, refNo, signDate, options.companyName, party, projectName, projectLocation, startDate, endDate, taxRate, pct, releaseDate, value, items, fmt, decimals]);
  const content = custom ?? generated;

  const save = async () => {
    if (!partyId) return message.error(sub ? t("SubcontractorRequired") : t("OwnerRequired"));
    if (!projectName.trim()) return message.error(t("ProjectRequired"));
    if (!endDate) return message.error(t("EndDateRequired"));
    const list = items.filter((it) => it.description.trim());
    if (!(value > 0)) return message.error(tAlerts("ContractValueRequired"));
    setSaving(true);
    const res = await saveContractAction({
      ...(contract ? { id: contract.id } : {}),
      kind,
      contractValue: Number(contractValue) || 0,
      priorAdvance: Number(priorAdvance) || 0,
      customerId: sub ? null : partyId,
      supplierId: sub ? partyId : null,
      parentId: sub ? parentId : null,
      projectName,
      projectLocation,
      refNo,
      signDate,
      startDate,
      endDate,
      ...pct,
      retentionReleaseDate: releaseDate,
      items: list.map((it) => ({
        itemNo: it.itemNo,
        description: it.description.trim(),
        unitName: it.unitName,
        qty: Number(it.qty) || 0,
        price: Number(it.price) || 0,
        amount: Number(it.amount) || 0,
      })),
      templateId: templateId ?? null,
      content: content || null,
      notes,
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("ContractSaved"));
    router.push(`/contracting/${contract?.id ?? res.data.id}`);
  };

  const title = contract
    ? `${t("EditContract")} ${contract.docNo}`
    : sub
      ? t("NewSubContract")
      : t("NewOwnerContract");

  // خانة مبلغ (العقد المختصر / الدفعة السابقة)
  const moneyBox = (value, onChange, props = {}) => (
    <InputNumber
      min={0}
      precision={decimals}
      style={{ width: "100%" }}
      value={value}
      onChange={(v) => onChange(v ?? 0)}
      {...props}
    />
  );

  const numberInput = (key, props = {}) => (
    <InputNumber
      min={0}
      style={{ width: "100%" }}
      disabled={locked}
      value={pct[key]}
      onChange={(v) => setPct((p) => ({ ...p, [key]: v ?? 0 }))}
      {...props}
    />
  );

  const columns = [
    { title: "#", key: "no", width: 45, align: "center", render: (_, __, i) => i + 1 },
    {
      title: t("ItemNo"),
      key: "itemNo",
      width: 90,
      render: (_, it) => (
        <Input value={it.itemNo} maxLength={30} disabled={locked} onChange={(e) => setItem(it.key, { itemNo: e.target.value })} />
      ),
    },
    {
      title: t("ItemDescription"),
      key: "description",
      width: 340,
      render: (_, it) => (
        <Input.TextArea
          autoSize={{ minRows: 1, maxRows: 4 }}
          value={it.description}
          maxLength={500}
          disabled={locked}
          onChange={(e) => setItem(it.key, { description: e.target.value })}
        />
      ),
    },
    {
      title: t("Unit"),
      key: "unitName",
      width: 90,
      render: (_, it) => (
        <Input value={it.unitName} maxLength={30} disabled={locked} onChange={(e) => setItem(it.key, { unitName: e.target.value })} />
      ),
    },
    {
      title: t("Qty"),
      key: "qty",
      width: 110,
      render: (_, it) => (
        <InputNumber min={0} precision={3} style={{ width: "100%" }} disabled={locked} value={it.qty} onChange={(v) => setItem(it.key, { qty: v ?? 0 })} />
      ),
    },
    {
      title: t("UnitPrice"),
      key: "price",
      width: 130,
      render: (_, it) => (
        <InputNumber min={0} precision={4} style={{ width: "100%" }} disabled={locked} value={it.price} onChange={(v) => setItem(it.key, { price: v ?? 0 })} />
      ),
    },
    {
      title: (
        <span>
          {t("ItemTotal")}
          <Tooltip title={t("ItemTotalHint")}>
            <QuestionCircleOutlined className="ms-1" />
          </Tooltip>
        </span>
      ),
      key: "amount",
      width: 150,
      render: (_, it) => (
        <InputNumber min={0} precision={decimals} style={{ width: "100%" }} disabled={locked} value={it.amount} onChange={(v) => setItem(it.key, { amount: v ?? 0 })} />
      ),
    },
    ...(locked
      ? []
      : [
          {
            title: "",
            key: "d",
            width: 50,
            align: "center",
            render: (_, it) => (
              <Button
                size="small"
                danger
                aria-label={t("Delete")}
                title={t("Delete")}
                icon={<DeleteOutlined />}
                onClick={() => setItems((list) => list.filter((x) => x.key !== it.key))}
              />
            ),
          },
        ]),
  ];

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">{title}</h1>
        <Button type="primary" size="large" icon={<SaveOutlined />} loading={saving} onClick={save}>
          {t("SaveContract")}
        </Button>
      </div>
      {locked && <Alert type="warning" showIcon className="mb-3" title={t("ContractLockedHint")} />}

      {/* البيانات والمواعيد */}
      <Card size="small" className="mb-3">
        <Row gutter={[12, 8]}>
          <Col xs={24} md={8}>
            <Label text={sub ? t("Subcontractor") : t("Owner")} />
            <Space.Compact style={{ width: "100%" }}>
              <Select
                style={{ width: "100%" }}
                disabled={locked}
                value={partyId ?? undefined}
                onChange={setPartyId}
                placeholder={sub ? t("ChooseSubcontractor") : t("ChooseOwner")}
                showSearch={{ optionFilterProp: "label" }}
                options={parties.map((c) => ({
                  value: c.id,
                  label: `${c.code} - ${nameOf(c)}${c.phone ? ` - ${c.phone}` : ""}`,
                }))}
              />
              {/* إضافة مالك (عميل) / مقاول باطن (مورد) جديد من غير ما تسيب العقد */}
              {!locked && (
                <QuickAddParty
                  kind={sub ? "suppliers" : "customers"}
                  onCreated={(c) => {
                    setAddedParties((p) => [c, ...p]);
                    setPartyId(c.id);
                  }}
                />
              )}
            </Space.Compact>
          </Col>
          {sub && (
            <Col xs={24} md={8}>
              <Label text={t("MainProject")} hint={t("MainProjectHint")} />
              <Select
                allowClear
                style={{ width: "100%" }}
                disabled={locked}
                value={parentId ?? undefined}
                onChange={(v) => {
                  setParentId(v ?? null);
                  const o = options.owners.find((x) => x.id === v);
                  if (o && !projectName) setProjectName(o.projectName);
                }}
                placeholder={t("ChooseProject")}
                showSearch={{ optionFilterProp: "label" }}
                options={options.owners.map((o) => ({ value: o.id, label: `${o.docNo} - ${o.projectName}` }))}
              />
            </Col>
          )}
          <Col xs={24} md={sub ? 8 : 10}>
            <Label text={t("ProjectName")} />
            <Input value={projectName} maxLength={200} onChange={(e) => setProjectName(e.target.value)} />
          </Col>
          <Col xs={24} md={sub ? 8 : 6}>
            <Label text={t("ProjectLocation")} />
            <Input value={projectLocation} maxLength={255} onChange={(e) => setProjectLocation(e.target.value)} />
          </Col>
          <Col xs={12} md={4}>
            <Label text={t("RefNo")} hint={t("RefNoHint")} />
            <Input value={refNo} maxLength={60} dir="ltr" onChange={(e) => setRefNo(e.target.value)} />
          </Col>
          <Col xs={12} md={4}>
            <Label text={t("SignDate")} />
            <DayPicker disabled={locked} value={signDate} onChange={(v) => v && setSignDate(v)} />
          </Col>
          <Col xs={12} md={4}>
            <Label text={t("StartDate")} />
            <DayPicker disabled={locked} allowClear value={startDate} onChange={(v) => setStartDate(v || null)} />
          </Col>
          <Col xs={12} md={4}>
            <Label text={t("EndDate")} hint={t("EndDateHint")} />
            <DayPicker value={endDate} min={startDate || signDate} onChange={(v) => v && setEndDate(v)} />
          </Col>
        </Row>
      </Card>

      {/* القيمة والنسب: قيمة العقد قبل الضريبة ← الضريبة والإجمالي والدفعة المقدمة أوتوماتيك */}
      <Card size="small" className="mb-3" title={t("FinancialTerms")}>
        <Row gutter={[12, 8]}>
          <Col xs={24} md={8} xl={4}>
            <Label text={t("ContractValueInput")} hint={t("ContractValueInputHint")} />
            {hasItems ? (
              <div className="font-bold text-base">{money(value)}</div>
            ) : (
              moneyBox(contractValue, setContractValue, { disabled: locked, size: "large" })
            )}
          </Col>
          {[
            [`${t("Vat")} ${taxRate}%`, tax],
            [t("TotalWithTax"), value + tax],
            [`${t("AdvanceAmount")}${pct.advancePct ? ` (${pct.advancePct}%)` : ""}`, advance, t("BeforeTax")],
            // إجمالي حجز الضمان على قيمة العقد كلها (بيتحجز من كل مستخلص بنفس النسبة)
            [`${t("RetentionAmount")}${pct.retentionPct ? ` (${pct.retentionPct}%)` : ""}`, retentionTotal, t("BeforeTax")],
          ].map(([label, v, hint]) => (
            <Col xs={12} md={8} xl={5} key={label}>
              <div className="text-xs text-slate-500 mb-1">
                {label}
                {hint && <span className="text-slate-400"> ({hint})</span>}
              </div>
              <div className="font-bold text-base">{money(v)}</div>
            </Col>
          ))}
        </Row>
        <Row gutter={[12, 8]} className="mt-3">
          <Col xs={12} md={4}>
            <Label text={t("AdvancePct")} hint={t("AdvancePctHint")} />
            {numberInput("advancePct", { max: 100, suffix: "%" })}
          </Col>
          <Col xs={12} md={4}>
            <Label text={t("RecoveryPct")} hint={t("RecoveryPctHint")} />
            {numberInput("recoveryPct", { max: 100, suffix: "%" })}
          </Col>
          <Col xs={12} md={4}>
            <Label text={t("RetentionPct")} hint={t("RetentionPctHint")} />
            {numberInput("retentionPct", { max: 100, suffix: "%" })}
          </Col>
          <Col xs={12} md={4}>
            <Label text={t("RetentionReleaseDate")} />
            <DayPicker allowClear value={releaseDate} onChange={(v) => setReleaseDate(v || null)} />
          </Col>
          <Col xs={12} md={4}>
            <Label text={t("PenaltyPerDay")} hint={t("PenaltyHint")} />
            <InputNumber
              min={0}
              style={{ width: "100%" }}
              value={pct.penaltyPerDay}
              onChange={(v) => setPct((p) => ({ ...p, penaltyPerDay: v ?? 0 }))}
            />
          </Col>
          <Col xs={12} md={4}>
            <Label text={t("PenaltyMaxPct")} />
            <InputNumber
              min={0}
              max={100}
              suffix="%"
              style={{ width: "100%" }}
              value={pct.penaltyMaxPct}
              onChange={(v) => setPct((p) => ({ ...p, penaltyMaxPct: v ?? 0 }))}
            />
          </Col>
          <Col xs={12} md={4}>
            <Label text={t("PriorAdvance")} hint={t("PriorAdvanceHint")} />
            {moneyBox(priorAdvance, setPriorAdvance, { disabled: locked })}
          </Col>
        </Row>
      </Card>

      {/* المقايسة: للعقود القديمة اللي اتسجلت ببنود بس (البنود دلوقتي بتتكتب في المستخلص) */}
      {hasItems && (
      <Card
        size="small"
        className="mb-3"
        title={t("Boq")}
        extra={
          !locked && (
            <Space wrap>
              <Button icon={<SnippetsOutlined />} onClick={() => setPasteOpen(true)}>
                {t("PasteFromExcel")}
              </Button>
              <Button icon={<PlusOutlined />} onClick={() => setItems((l) => [...l, emptyItem()])}>
                {t("AddItem")}
              </Button>
            </Space>
          )
        }
      >
        <Table
          size="small"
          bordered
          rowKey="key"
          pagination={false}
          dataSource={items}
          columns={columns}
          tableLayout="fixed"
          scroll={{ x: columns.reduce((s, c) => s + c.width, 0), y: 460 }}
        />
      </Card>
      )}

      {/* نص العقد */}
      <Card
        size="small"
        title={t("ContractText")}
        className="mb-3"
        extra={
          <Space wrap>
            <Select
              style={{ width: 220 }}
              value={templateId ?? undefined}
              placeholder={t("ChooseTemplate")}
              onChange={(v) => {
                setTemplateId(v);
                setCustom(null);
              }}
              options={options.templates.map((x) => ({ value: x.id, label: x.name }))}
            />
            <Button icon={<ReloadOutlined />} onClick={() => setCustom(null)}>
              {t("RefillFromTemplate")}
            </Button>
          </Space>
        }
      >
        <Alert type="info" showIcon className="mb-2" title={t("ContractTextHint")} />
        <Input.TextArea
          rows={16}
          value={content}
          maxLength={60000}
          style={{ lineHeight: 1.8 }}
          onChange={(e) => setCustom(e.target.value)}
        />
      </Card>

      <Card size="small">
        <Label text={t("Notes")} />
        <Input.TextArea rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Card>

      {/* لصق البنود من Excel */}
      <ClientOnly>
        <Modal
          open={pasteOpen}
          title={t("PasteFromExcel")}
          onCancel={() => setPasteOpen(false)}
          width={760}
          mask={{ closable: false }}
          footer={
            <Space>
              <Button onClick={() => setPasteOpen(false)}>{t("Cancel")}</Button>
              <Button onClick={() => applyPaste(false)}>{t("PasteAppend")}</Button>
              <Button type="primary" onClick={() => applyPaste(true)}>
                {t("PasteReplace")}
              </Button>
            </Space>
          }
        >
          <Alert type="info" showIcon className="mb-2" title={t("PasteHint")} />
          <Input.TextArea
            rows={12}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={t("PastePlaceholder")}
          />
        </Modal>
      </ClientOnly>
    </div>
  );
}

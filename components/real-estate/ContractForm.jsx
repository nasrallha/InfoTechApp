"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import { DeleteOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import DayPicker from "@/components/common/DayPicker";
import { saveContractAction } from "@/actions/rent-contract.actions";
import { today, formatDay } from "@/lib/dates";
import {
  PAY_EVERY,
  addDays,
  buildInstallments,
  contractTotal,
  contractValues,
  defaultEndDate,
  fillTemplate,
} from "@/lib/rent";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useRentFormat } from "./useRentFormat";

// ============================================================
// عقد إيجار جديد / تعديل / تجديد
// - المستأجر + وحدة أو أكتر (بإيجار سنوي لكل وحدة) + المدة + فترة السداد
// - جدول الدفعات بيتحسب قدامك وإنت بتكتب
// - نص العقد: من النموذج بعد ملء الخانات، وتقدر تعدّله قبل الحفظ
//   (لو عدّلته بإيدك مش بيتمسح، وزر «إعادة التعبئة» بيرجّعه من النموذج)
// - العقد اللي عليه فواتير: رقم إيجار والملاحظات بس
// ============================================================
export default function ContractForm({ options, contract = null, renewFrom = null }) {
  const t = useTranslations("RealEstate");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const router = useRouter();
  const { amount: money, decimals } = useCurrency();
  const fmt = useRentFormat();
  const src = contract ?? renewFrom;
  const locked = contract ? !contract.editable : false;

  // البداية: التجديد ← بعد نهاية العقد القديم
  const startInit = contract
    ? contract.startDate
    : renewFrom
      ? addDays(renewFrom.endDate, 1)
      : today();
  const [customerId, setCustomerId] = useState(src?.customer?.id ?? null);
  const [ejarNo, setEjarNo] = useState(contract?.ejarNo ?? "");
  const [startDate, setStartDate] = useState(startInit);
  const [endDate, setEndDate] = useState(
    contract ? contract.endDate : defaultEndDate(startInit, 12),
  );
  const [payEvery, setPayEvery] = useState(src?.payEvery ?? 3);
  const [lines, setLines] = useState(
    (src?.units ?? []).map((u) => ({ unitId: u.id, annualRent: u.annualRent })),
  );
  const [templateId, setTemplateId] = useState(
    src?.templateId ?? options.templates.find((x) => x.isDefault)?.id ?? options.templates[0]?.id ?? null,
  );
  const [notes, setNotes] = useState(contract?.notes ?? "");
  // نص العقد: لو اتعدّل بإيده (أو عقد محفوظ) مش بيتمسح مع التغيير
  const [custom, setCustom] = useState(contract?.content ?? null);
  const [saving, setSaving] = useState(false);

  const unitById = useMemo(() => new Map(options.units.map((u) => [u.id, u])), [options.units]);
  const customer = options.customers.find((c) => c.id === customerId) ?? src?.customer ?? null;
  const nameOf = (c) => (locale === "ar" ? c.arName : c.enName || c.arName);

  // الوحدة مشغولة في فترة العقد ده (عقد تاني ساري بيتعارض)
  const busy = (u) => u.busy.some((p) => p.from <= endDate && p.to >= startDate);

  const annual = lines.reduce((s, l) => s + (Number(l.annualRent) || 0), 0);
  const installments = useMemo(
    () => buildInstallments({ startDate, endDate, payEvery, annualRent: annual, decimals }),
    [startDate, endDate, payEvery, annual, decimals],
  );
  const total = contractTotal(installments);

  // نص العقد من النموذج (رقم العقد بيتملي وقت الحفظ)
  const template = options.templates.find((x) => x.id === templateId);
  const generated = useMemo(() => {
    if (!template) return "";
    return fillTemplate(
      template.content,
      contractValues(
        {
          docNo: contract?.docNo,
          ejarNo,
          contractDate: contract ? null : today(),
          companyName: options.companyName,
          tenant: customer
            ? {
                name: customer.arName,
                idNo: customer.idNumber || customer.taxNo,
                phone: customer.phone,
                address: [customer.city, customer.district, customer.street].filter(Boolean).join(" - "),
              }
            : null,
          units: lines
            .map((l) => {
              const u = unitById.get(l.unitId);
              return u ? { ...u, annualRent: l.annualRent } : null;
            })
            .filter(Boolean),
          startDate,
          endDate,
          payEvery,
          installments,
        },
        fmt,
      ),
    );
  }, [template, contract, ejarNo, options.companyName, customer, lines, unitById, startDate, endDate, payEvery, installments, fmt]);
  const content = custom ?? generated;

  const addUnit = (unitId) => {
    const u = unitById.get(unitId);
    if (!u || lines.some((l) => l.unitId === unitId)) return;
    setLines((ls) => [...ls, { unitId, annualRent: u.annualRent }]);
  };

  const save = async () => {
    if (!customerId) return message.error(t("TenantRequired"));
    if (!lines.length) return message.error(tAlerts("RentUnitsRequired"));
    setSaving(true);
    const res = await saveContractAction({
      ...(contract ? { id: contract.id } : {}),
      customerId,
      ejarNo,
      startDate,
      endDate,
      payEvery,
      units: lines.map((l) => ({ unitId: l.unitId, annualRent: Number(l.annualRent) || 0 })),
      templateId: templateId ?? null,
      content: content || null,
      notes,
      renewedFromId: renewFrom?.id ?? null,
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("ContractSaved"));
    router.push(`/real-estate/contracts/${contract?.id ?? res.data.id}`);
  };

  const title = contract
    ? `${t("EditContract")} ${contract.docNo}`
    : renewFrom
      ? `${t("RenewContract")} ${renewFrom.docNo}`
      : t("NewContract");

  // اختيار الوحدات: مجمّعة بالعقار، والمشغولة في الفترة مقفولة
  const unitOptions = useMemo(() => {
    const groups = new Map();
    for (const u of options.units) {
      if (lines.some((l) => l.unitId === u.id)) continue;
      const g = groups.get(u.property.id) ?? { label: u.property.name, options: [] };
      const isBusy = busy(u);
      g.options.push({
        value: u.id,
        disabled: isBusy,
        label: `${u.property.name} - ${t(`kind_${u.kind}`)} ${u.unitNo}${isBusy ? ` (${t("status_rented")})` : ""}`,
      });
      groups.set(u.property.id, g);
    }
    return [...groups.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.units, lines, startDate, endDate]);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">{title}</h1>
        <Button type="primary" size="large" icon={<SaveOutlined />} loading={saving} onClick={save}>
          {t("SaveContract")}
        </Button>
      </div>
      {locked && <Alert type="warning" showIcon className="mb-3" title={t("ContractLockedHint")} />}

      <Card size="small" className="mb-3">
        <Row gutter={[12, 8]}>
          <Col xs={24} md={8}>
            <div className="text-xs text-slate-500 mb-1">{t("Tenant")}</div>
            <Select
              style={{ width: "100%" }}
              disabled={locked}
              value={customerId ?? undefined}
              onChange={setCustomerId}
              placeholder={t("ChooseTenant")}
              showSearch={{ optionFilterProp: "label" }}
              options={options.customers.map((c) => ({
                value: c.id,
                label: `${c.code} - ${nameOf(c)}${c.phone ? ` - ${c.phone}` : ""}`,
              }))}
            />
          </Col>
          <Col xs={24} md={4}>
            <div className="text-xs text-slate-500 mb-1">{t("EjarNo")}</div>
            <Input value={ejarNo} maxLength={40} dir="ltr" onChange={(e) => setEjarNo(e.target.value)} />
          </Col>
          <Col xs={12} md={4}>
            <div className="text-xs text-slate-500 mb-1">{t("StartDate")}</div>
            <DayPicker
              disabled={locked}
              value={startDate}
              onChange={(v) => {
                if (!v) return;
                setStartDate(v);
                if (!contract) setEndDate(defaultEndDate(v, 12));
              }}
            />
          </Col>
          <Col xs={12} md={4}>
            <div className="text-xs text-slate-500 mb-1">{t("EndDate")}</div>
            <DayPicker disabled={locked} value={endDate} min={startDate} onChange={(v) => v && setEndDate(v)} />
          </Col>
          <Col xs={24} md={4}>
            <div className="text-xs text-slate-500 mb-1">{t("PayEvery")}</div>
            <Select
              style={{ width: "100%" }}
              disabled={locked}
              value={payEvery}
              onChange={setPayEvery}
              options={PAY_EVERY.map((m) => ({ value: m, label: t(`every_${m}`) }))}
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={[12, 12]} className="mb-3">
        {/* الوحدات */}
        <Col xs={24} lg={13}>
          <Card size="small" title={t("ContractUnits")} className="h-full">
            {!locked && (
              <Select
                className="mb-2"
                style={{ width: "100%" }}
                value={null}
                placeholder={t("AddUnit")}
                onChange={addUnit}
                showSearch={{ optionFilterProp: "label" }}
                options={unitOptions}
              />
            )}
            <Table
              size="small"
              bordered
              rowKey="unitId"
              pagination={false}
              dataSource={lines}
              scroll={{ x: 560 }}
              locale={{ emptyText: t("NoContractUnits") }}
              columns={[
                {
                  title: t("Unit"),
                  key: "u",
                  render: (_, l) => {
                    const u = unitById.get(l.unitId);
                    return u ? `${u.property.name} - ${t(`kind_${u.kind}`)} ${u.unitNo}` : "—";
                  },
                },
                {
                  title: t("UseType"),
                  key: "ut",
                  width: 90,
                  align: "center",
                  render: (_, l) => {
                    const u = unitById.get(l.unitId);
                    return u ? <Tag>{t(`use_${u.useType}`)}</Tag> : null;
                  },
                },
                {
                  title: t("AnnualRent"),
                  key: "r",
                  width: 150,
                  render: (_, l) => (
                    <InputNumber
                      min={0}
                      disabled={locked}
                      style={{ width: "100%" }}
                      value={l.annualRent}
                      onChange={(v) =>
                        setLines((ls) => ls.map((x) => (x.unitId === l.unitId ? { ...x, annualRent: v ?? 0 } : x)))
                      }
                    />
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
                        render: (_, l) => (
                          <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => setLines((ls) => ls.filter((x) => x.unitId !== l.unitId))}
                          />
                        ),
                      },
                    ]),
              ]}
            />
          </Card>
        </Col>
        {/* جدول الدفعات */}
        <Col xs={24} lg={11}>
          <Card
            size="small"
            className="h-full"
            title={t("Installments")}
            extra={
              <span className="font-bold">
                {t("ContractTotal")}: {money(total)}
              </span>
            }
          >
            <Table
              size="small"
              bordered
              rowKey="seq"
              pagination={false}
              dataSource={installments}
              scroll={{ x: 460, y: 300 }}
              columns={[
                { title: "#", dataIndex: "seq", width: 45, align: "center" },
                {
                  title: t("Period"),
                  key: "p",
                  render: (_, r) => (
                    <bdi>
                      {formatDay(r.periodFrom)} - {formatDay(r.periodTo)}
                    </bdi>
                  ),
                },
                { title: t("DueDate"), dataIndex: "dueDate", width: 105, render: (v) => formatDay(v) },
                { title: t("Amount"), dataIndex: "amount", width: 110, align: "end", render: (v) => money(v) },
              ]}
            />
          </Card>
        </Col>
      </Row>

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
        <div className="text-xs text-slate-500 mb-1">{t("Notes")}</div>
        <Input.TextArea rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Card>
    </div>
  );
}

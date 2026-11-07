"use client";

import { useState } from "react";
import {
  Alert,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
} from "antd";
import { useLocale, useTranslations } from "next-intl";
import DayPicker from "@/components/common/DayPicker";
import QuickAddParty from "@/components/parties/QuickAddParty";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { applyFieldErrors } from "@/lib/form-errors";
import { today } from "@/lib/dates";
import {
  createContractAction,
  updateContractAction,
} from "@/actions/technician.actions";
import { listSep } from "@/lib/list-sep";

// مواعيد الزيارات (نفس حساب السيرفر) عشان تبان قبل الحفظ
function schedule(start, end, every) {
  if (!start || !end || !(every > 0)) return [];
  const out = [];
  const [y, m, d] = start.split("-").map(Number);
  for (let i = 1; i <= 240; i++) {
    const tgt = new Date(Date.UTC(y, m - 1 + every * i, 1));
    const last = new Date(
      Date.UTC(tgt.getUTCFullYear(), tgt.getUTCMonth() + 1, 0),
    ).getUTCDate();
    tgt.setUTCDate(Math.min(d, last));
    const day = tgt.toISOString().slice(0, 10);
    if (day > end) break;
    out.push(day);
  }
  return out;
}

// ============================================================
// عقد صيانة جديد / تعديل بياناته
// (المدة والفترة بيتحددوا مرة واحدة مع العقد عشان جدول الزيارات)
// ============================================================
export default function ContractFormModal({
  contract = null,
  customers = [],
  technicians = [],
  onClose,
  onSaved,
}) {
  const t = useTranslations("Contracts");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  // العملاء اللي اتضافوا من الزر السريع
  const [added, setAdded] = useState([]);
  const allCustomers = [
    ...customers,
    ...added.filter((a) => !customers.some((c) => c.id === a.id)),
  ];
  const isEdit = Boolean(contract);
  const req = [{ required: true, message: tAlerts("RequiredField") }];
  const v = Form.useWatch([], form) ?? {};
  // التعديل: الزيارات اللي اتعملت/اتخطت بتفضل، والجديدة بعد آخر واحدة فيهم
  const kept = isEdit
    ? (contract.visits ?? [])
        .filter((x) => x.status !== "pending")
        .map((x) => x.dueDate)
    : [];
  const lastKept = kept.reduce((m, d) => (d > m ? d : m), "");
  const scheduleChanged =
    !isEdit ||
    (v.startDate !== undefined &&
      (v.startDate !== contract.startDate ||
        v.endDate !== contract.endDate ||
        Number(v.intervalMonths) !== contract.intervalMonths));
  const visits = schedule(
    v.startDate,
    v.endDate,
    Number(v.intervalMonths),
  ).filter((d) => d > lastKept);

  const save = async (values) => {
    setSaving(true);
    const res = isEdit
      ? await updateContractAction({ ...values, id: contract.id })
      : await createContractAction(values);
    setSaving(false);
    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      return showActionError(res, tAlerts, locale);
    }
    message.success(t(isEdit ? "Updated" : "Created"));
    onSaved?.(res.data.id);
    onClose();
  };

  const plusYear = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  };

  return (
    <Modal
      open
      width={720}
      title={isEdit ? t("Edit") : t("New")}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={save}
        initialValues={
          isEdit
            ? {
                deviceName: contract.deviceName,
                serialText: contract.serialText ?? "",
                address: contract.address ?? "",
                amount: contract.amount ?? undefined,
                technicianId: contract.technician?.id ?? undefined,
                notes: contract.notes ?? "",
                intervalMonths: contract.intervalMonths,
                startDate: contract.startDate,
                endDate: contract.endDate,
              }
            : {
                startDate: today(),
                endDate: plusYear(),
                intervalMonths: 3,
              }
        }
      >
        {!isEdit && (
          <Form.Item label={t("Customer")} required>
            <Space.Compact style={{ width: "100%" }}>
              <Form.Item name="customerId" rules={req} noStyle>
                <Select
                  showSearch
                  style={{ width: "100%" }}
                  optionFilterProp="label"
                  options={allCustomers.map((c) => ({
                    value: c.id,
                    label: `${c.code} - ${nm(c)}${c.phone ? ` (${c.phone})` : ""}`,
                  }))}
                />
              </Form.Item>
              {/* عميل جديد من غير ما تقفل العقد */}
              <QuickAddParty
                kind="customers"
                onCreated={(c) => {
                  setAdded((p) => [...p, c]);
                  form.setFieldValue("customerId", c.id);
                }}
              />
            </Space.Compact>
          </Form.Item>
        )}
        <Row gutter={12}>
          <Col xs={24} md={14}>
            <Form.Item name="deviceName" label={t("Device")} rules={req}>
              <Input placeholder={t("DevicePlaceholder")} />
            </Form.Item>
          </Col>
          <Col xs={24} md={10}>
            <Form.Item name="serialText" label={t("Serial")}>
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="address" label={t("Address")}>
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
        <Row gutter={12}>
          <Col xs={8}>
            <Form.Item name="intervalMonths" label={t("Every")} rules={req}>
              <InputNumber
                min={1}
                max={60}
                precision={0}
                suffix={t("Months")}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
          <Col xs={8}>
            <Form.Item name="startDate" label={t("StartDate")} rules={req}>
              <DayPicker />
            </Form.Item>
          </Col>
          <Col xs={8}>
            <Form.Item name="endDate" label={t("EndDate")} rules={req}>
              <DayPicker />
            </Form.Item>
          </Col>
        </Row>
        {scheduleChanged && (
          <Alert
            type={visits.length || kept.length ? "info" : "warning"}
            showIcon
            className="mb-3"
            title={
              visits.length
                ? t("VisitsPreview", {
                    n: visits.length,
                    list: visits.slice(0, 6).join(listSep(locale)),
                  })
                : t("NoVisitsPreview")
            }
            description={
              isEdit ? t("RescheduleNote", { kept: kept.length }) : null
            }
          />
        )}
        <Row gutter={12}>
          <Col xs={24} md={12}>
            <Form.Item name="technicianId" label={t("Technician")}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={technicians.map((x) => ({
                  value: x.id,
                  label: nm(x),
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="amount"
              label={t("Amount")}
              tooltip={t("AmountHint")}
            >
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="notes" label={t("Notes")}>
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

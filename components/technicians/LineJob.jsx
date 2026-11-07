"use client";

import { useStaffT } from "./useStaffT";
import { useEffect, useState } from "react";
import {
  Button,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Tag,
} from "antd";
import { PlusOutlined, ToolOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useLocale, useTranslations } from "next-intl";
import {
  useCan,
  useModule,
  useModuleSettings,
} from "@/components/auth/AuthProvider";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { applyFieldErrors } from "@/lib/form-errors";
import { formatDateTime } from "@/lib/dates";
import {
  activeTechniciansAction,
  createTechnicianAction,
} from "@/actions/technician.actions";

// الفنيين النشطين (مرة واحدة لكل الصفحة)
let cache = null;
export async function loadTechnicians() {
  if (!cache)
    cache = activeTechniciansAction().then((r) => (r.success ? r.data : []));
  return cache;
}

// ============================================================
// الفني والموعد لسطر خدمة في الفاتورة (وحدة technicians)
// line.job: { technicianId, at, address, note, status }
// onChange({ job })
// ============================================================
export default function LineJob({ line, onChange, disabled = false }) {
  const t = useStaffT();
  const on = useModule("technicians");
  // الكوافير/الحلاق/المساج: اللي باع الصنف العادي كمان (عمولة البيع)
  const { staffTitle = "technician" } = useModuleSettings();
  const sellerToo = staffTitle !== "technician";
  const shown = on && (line.isService || sellerToo);
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [techs, setTechs] = useState([]);
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  useEffect(() => {
    if (!shown) return;
    let alive = true;
    loadTechnicians().then((list) => alive && setTechs(list));
    return () => {
      alive = false;
    };
  }, [shown]);

  if (!shown) return null;
  const job = line.job;
  const tech = techs.find((x) => x.id === job?.technicianId);

  return (
    <div className="mt-1">
      <Tag
        color={job?.technicianId || job?.at ? "purple" : "default"}
        icon={<ToolOutlined />}
        style={{ cursor: disabled ? "default" : "pointer" }}
        onClick={disabled ? undefined : () => setOpen(true)}
      >
        {job?.technicianId || job?.at
          ? [nm(tech), job?.at ? formatDateTime(job.at) : null]
              .filter(Boolean)
              .join(" — ")
          : line.isService
            ? t("SetJob")
            : t("SetSeller")}
        {job?.status === "done" ? ` ✓` : ""}
      </Tag>
      {open && (
        <JobModal
          job={job}
          staffOnly={!line.isService}
          techs={techs}
          onTechAdded={(x) => {
            // الفني الجديد يبان في كل سطور الفاتورة
            cache = Promise.resolve([...techs, x]);
            setTechs((prev) => [...prev, x]);
          }}
          onClose={() => setOpen(false)}
          onSave={(v) => {
            onChange?.({ job: v });
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

// staffOnly: صنف عادي ← اختيار اللي باعه بس (من غير موعد ولا عنوان)
function JobModal({ job, staffOnly, techs, onTechAdded, onClose, onSave }) {
  const t = useStaffT();
  const locale = useLocale();
  const can = useCan();
  const [form] = Form.useForm();
  const [adding, setAdding] = useState(false);
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);

  return (
    <Modal
      open
      width={620}
      title={staffOnly ? t("SetSeller") : t("JobTitle")}
      onCancel={onClose}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
        initialValues={{
          technicianId: job?.technicianId ?? undefined,
          at: job?.at ? dayjs(job.at) : undefined,
          address: job?.address ?? "",
          note: job?.note ?? "",
        }}
        onFinish={(v) =>
          onSave({
            technicianId: v.technicianId ?? null,
            at: v.at ? v.at.toISOString() : null,
            address: v.address?.trim() || null,
            note: v.note?.trim() || null,
            status: job?.status ?? "pending",
            doneAt: job?.doneAt ?? null,
          })
        }
      >
        <Row gutter={12}>
          <Col xs={24} md={12}>
            <Form.Item label={t("Technician")} required={false}>
              {/* اختيار الفني + زر إضافة فني جديد من نفس المكان */}
              <Space.Compact style={{ width: "100%" }}>
                <Form.Item name="technicianId" noStyle>
                  <Select
                    allowClear
                    showSearch
                    style={{ width: "100%" }}
                    placeholder={t("PickTechnician")}
                    optionFilterProp="label"
                    notFoundContent={t("NoTechnicians")}
                    options={techs.map((x) => ({ value: x.id, label: nm(x) }))}
                  />
                </Form.Item>
                {can("technicians.create") && (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    title={t("New")}
                    onClick={() => setAdding(true)}
                  />
                )}
              </Space.Compact>
            </Form.Item>
          </Col>
          {!staffOnly && (
            <Col xs={24} md={12}>
              <Form.Item name="at" label={t("JobAt")}>
                <DatePicker
                  showTime={{ format: "HH:mm" }}
                  format="DD/MM/YYYY HH:mm"
                  placeholder={t("PickJobAt")}
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>
          )}
        </Row>
        {!staffOnly && (
          <>
            <Form.Item name="address" label={t("Address")}>
              <Input maxLength={500} placeholder={t("AddressPlaceholder")} />
            </Form.Item>
            <Form.Item name="note" label={t("Note")}>
              <Input.TextArea
                rows={4}
                maxLength={500}
                showCount
                placeholder={t("JobNotePlaceholder")}
              />
            </Form.Item>
          </>
        )}
      </Form>

      {adding && (
        <QuickTechnician
          onClose={() => setAdding(false)}
          onAdded={(x) => {
            onTechAdded(x);
            form.setFieldsValue({ technicianId: x.id });
            setAdding(false);
          }}
        />
      )}
    </Modal>
  );
}

// إضافة فني سريعة من نافذة الموعد (الاسم والجوال والنسبة)
export function QuickTechnician({ onClose, onAdded }) {
  const t = useStaffT();
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const req = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
  ];

  const save = async (v) => {
    const data = {
      arName: v.arName.trim(),
      // الاسم الإنجليزي اختياري هنا: لو فاضي ياخد العربي
      enName: v.enName?.trim() || v.arName.trim(),
      phone: v.phone?.trim() || null,
      commissionRate: v.commissionRate ?? 0,
      isActive: true,
    };
    setSaving(true);
    const res = await createTechnicianAction(data);
    setSaving(false);
    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      return showActionError(res, tAlerts, locale);
    }
    message.success(t("Saved"));
    onAdded({ id: res.data.id, arName: data.arName, enName: data.enName });
  };

  return (
    <Modal
      open
      title={t("New")}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
        onFinish={save}
        initialValues={{ commissionRate: 0 }}
      >
        <Row gutter={12}>
          <Col xs={12}>
            <Form.Item name="arName" label={t("ArName")} rules={req}>
              <Input autoFocus autoComplete="off" />
            </Form.Item>
          </Col>
          <Col xs={12}>
            <Form.Item name="enName" label={t("EnName")}>
              <Input dir="ltr" autoComplete="off" />
            </Form.Item>
          </Col>
          <Col xs={14}>
            <Form.Item name="phone" label={t("Phone")}>
              <Input dir="ltr" autoComplete="off" />
            </Form.Item>
          </Col>
          <Col xs={10}>
            <Form.Item name="commissionRate" label={t("Rate")}>
              <InputNumber
                min={0}
                max={100}
                suffix="%"
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

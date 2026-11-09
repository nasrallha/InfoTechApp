"use client";

import { useEffect, useMemo, useState } from "react";
import { AutoComplete, Col, Form, Input, Modal, Row, Select } from "antd";
import { CarOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { applyFieldErrors } from "@/lib/form-errors";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import {
  createVehicleAction,
  updateVehicleAction,
  vehicleTypesAction,
} from "@/actions/vehicle.actions";
import PhoneField from "@/components/common/PhoneField";

// ============================================================
// إضافة / تعديل سيارة (من شاشة السيارات أو من فاتورة البيع)
// - رقم اللوحة إلزامي، والباقي اختياري (الزبون العابر)
// - النوع: كتابة حرة، واللي اتكتب قبل كده بيظهر كاقتراح (من غير تكرار)
// vehicle: للتعديل | initial: قيم أولية للإضافة (اللوحة المكتوبة، العميل)
// onSaved(vehicle) بعد الحفظ
// ============================================================
export default function VehicleFormModal({
  vehicle = null,
  initial = {},
  customers = [],
  onClose,
  onSaved,
}) {
  const t = useTranslations("Vehicles");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  const [form] = Form.useForm();
  const [types, setTypes] = useState([]);
  const [busy, setBusy] = useState(false);
  const typeText = Form.useWatch("vehicleType", form) ?? "";

  useEffect(() => {
    let alive = true;
    vehicleTypesAction().then((res) => {
      if (alive && res.success) setTypes(res.data);
    });
    return () => {
      alive = false;
    };
  }, []);

  const typeOptions = useMemo(() => {
    const q = typeText.trim().toLowerCase();
    return types
      .filter((x) => !q || x.toLowerCase().includes(q))
      .slice(0, 50)
      .map((x) => ({ value: x }));
  }, [types, typeText]);

  const save = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setBusy(true);
    const payload = {
      plateNo: values.plateNo,
      vehicleType: values.vehicleType ?? null,
      customerId: values.customerId ?? null,
      phone: values.phone ?? null,
      notes: values.notes ?? null,
    };
    const res = vehicle
      ? await updateVehicleAction({ ...payload, id: vehicle.id })
      : await createVehicleAction(payload);
    setBusy(false);
    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      return showActionError(res, tAlerts, locale);
    }
    message.success(t(vehicle ? "Updated" : "Added"));
    onSaved?.(res.data);
    onClose();
  };

  const req = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
  ];

  return (
    <Modal
      open
      width={620}
      title={
        <span>
          <CarOutlined /> {vehicle ? t("Edit") : t("New")}
        </span>
      }
      okText={t("Save")}
      onOk={save}
      confirmLoading={busy}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={
          vehicle
            ? {
                plateNo: vehicle.plateNo,
                vehicleType: vehicle.vehicleType ?? undefined,
                customerId: vehicle.customerId ?? undefined,
                phone: vehicle.phone ?? undefined,
                notes: vehicle.notes ?? undefined,
              }
            : initial
        }
        onFinish={save}
      >
        <Row gutter={12}>
          <Col xs={24} md={12}>
            <Form.Item name="plateNo" label={t("PlateNo")} rules={req}>
              <Input
                size="large"
                maxLength={30}
                autoFocus
                style={{ fontWeight: 700, letterSpacing: 1 }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="vehicleType"
              label={t("VehicleType")}
              tooltip={t("VehicleTypeHint")}
            >
              <AutoComplete
                size="large"
                options={typeOptions}
                maxLength={100}
                placeholder={t("VehicleTypePlaceholder")}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="customerId" label={t("Customer")}>
              <Select
                showSearch
                allowClear
                optionFilterProp="label"
                placeholder={t("NoCustomer")}
                options={customers.map((c) => ({
                  value: c.id,
                  label: `${c.code} - ${nm(c)}${c.phone ? ` (${c.phone})` : ""}`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <PhoneField label={t("Phone")} />
          </Col>
          <Col xs={24}>
            <Form.Item name="notes" label={t("Notes")} className="mb-0">
              <Input.TextArea rows={2} maxLength={500} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

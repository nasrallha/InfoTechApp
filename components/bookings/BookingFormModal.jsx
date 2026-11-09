"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AutoComplete,
  Button,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Tag,
} from "antd";
import { CalendarOutlined, PlusOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import DayPicker from "@/components/common/DayPicker";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { applyFieldErrors } from "@/lib/form-errors";
import { today } from "@/lib/dates";
import { useStaffT } from "@/components/technicians/useStaffT";
import { QuickTechnician } from "@/components/technicians/LineJob";
import { useCan } from "@/components/auth/AuthProvider";
import {
  bookingSlotsAction,
  createBookingAction,
  updateBookingAction,
} from "@/actions/booking.actions";
import PhoneField from "@/components/common/PhoneField";

// ============================================================
// حجز جديد / تعديل حجز (من البرنامج)
// العميل: مسجّل، أو اسم + جوال (الزبون العابر)
// الميعاد: المواعيد الفاضية تظهر حسب مدة الخدمات ومقدم الخدمة
// ============================================================
export default function BookingFormModal({
  booking = null,
  initial = {},
  services = [],
  staff = [],
  customers = [],
  settings = {},
  onClose,
  onSaved,
}) {
  const t = useTranslations("Bookings");
  const tStaff = useStaffT();
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState([]);
  // إضافة مقدم خدمة جديد من نفس الشاشة
  const can = useCan();
  const [addingStaff, setAddingStaff] = useState(false);
  const [newStaff, setNewStaff] = useState([]);
  const staffList = [...staff, ...newStaff];
  const day = Form.useWatch("day", form);
  const serviceIds = Form.useWatch("serviceIds", form) ?? [];
  const technicianId = Form.useWatch("technicianId", form);
  const customerId = Form.useWatch("customerId", form);
  const atHome = Form.useWatch("atHome", form);

  const byId = useMemo(
    () => new Map(services.map((s) => [s.id, s])),
    [services],
  );
  const picked = serviceIds.map((id) => byId.get(id)).filter(Boolean);
  const duration = picked.reduce((s, x) => s + (x.durationMin || 0), 0);
  const total = picked.reduce((s, x) => s + (x.price || 0), 0);

  // المواعيد الفاضية
  useEffect(() => {
    if (!day) return;
    let alive = true;
    bookingSlotsAction({
      day,
      durationMin: duration,
      technicianId: technicianId ?? null,
      excludeId: booking?.id ?? null,
    }).then((res) => {
      if (alive) setSlots(res.success ? res.data : []);
    });
    return () => {
      alive = false;
    };
  }, [day, duration, technicianId, booking?.id]);

  const save = async () => {
    let v;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    setBusy(true);
    const payload = {
      customerId: v.customerId ?? null,
      customerName: v.customerName ?? null,
      phone: v.phone ?? null,
      technicianId: v.technicianId ?? null,
      serviceIds: v.serviceIds ?? [],
      day: v.day,
      time: v.time,
      atHome: Boolean(v.atHome),
      address: v.address ?? null,
      locationUrl: v.locationUrl ?? null,
      notes: v.notes ?? null,
    };
    const res = booking
      ? await updateBookingAction({ ...payload, id: booking.id })
      : await createBookingAction(payload);
    setBusy(false);
    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      return showActionError(res, tAlerts, locale);
    }
    message.success(t("Saved", { number: `BK-${res.data.number}` }));
    onSaved?.(res.data);
    onClose();
  };

  const customer = customers.find((c) => c.id === customerId);

  return (
    <Modal
      open
      width={760}
      title={
        <span>
          <CalendarOutlined />{" "}
          {booking ? `${t("Edit")} BK-${booking.number}` : t("New")}
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
          booking
            ? {
                customerId: booking.customerId ?? undefined,
                customerName: booking.customerName,
                phone: booking.phone,
                technicianId: booking.technicianId ?? undefined,
                serviceIds: booking.items
                  .map((i) => i.productId)
                  .filter(Boolean),
                day: booking.day,
                time: booking.time,
                atHome: booking.atHome,
                address: booking.address ?? undefined,
                locationUrl: booking.locationUrl ?? undefined,
                notes: booking.notes ?? undefined,
              }
            : { day: today(), atHome: false, serviceIds: [], ...initial }
        }
      >
        <Row gutter={12}>
          <Col xs={24} md={12}>
            <Form.Item name="customerId" label={t("Customer")}>
              <Select
                showSearch
                allowClear
                optionFilterProp="label"
                placeholder={t("WalkIn")}
                onChange={(id) => {
                  const c = customers.find((x) => x.id === id);
                  if (c)
                    form.setFieldsValue({
                      customerName: nm(c),
                      phone: c.phone ?? form.getFieldValue("phone"),
                    });
                }}
                options={customers.map((c) => ({
                  value: c.id,
                  label: `${c.code} - ${nm(c)}${c.phone ? ` (${c.phone})` : ""}`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="customerName"
              label={t("Name")}
              rules={[
                {
                  required: !customer,
                  whitespace: true,
                  message: tAlerts("RequiredField"),
                },
              ]}
            >
              <Input maxLength={150} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <PhoneField
              label={t("Phone")}
              rules={[
                {
                  required: !customer?.phone,
                  whitespace: true,
                  message: tAlerts("RequiredField"),
                },
              ]}
            />
          </Col>
          <Col xs={24}>
            <Form.Item
              name="serviceIds"
              label={t("Services")}
              rules={[
                { required: true, message: tAlerts("BookingNoServices") },
              ]}
              extra={
                picked.length ? (
                  <span>
                    {duration > 0 && (
                      <Tag color="blue">{t("DurationN", { n: duration })}</Tag>
                    )}
                    <Tag color="green">{money(total)}</Tag>
                  </span>
                ) : null
              }
            >
              <Select
                mode="multiple"
                showSearch
                optionFilterProp="label"
                placeholder={t("PickServices")}
                options={services.map((s) => ({
                  value: s.id,
                  label: `${nm(s)}${s.durationMin ? ` (${t("DurationN", { n: s.durationMin })})` : ""}`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label={tStaff("Technician")}>
              <Space.Compact style={{ width: "100%" }}>
                <Form.Item name="technicianId" noStyle>
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder={t("AnyStaff")}
                    notFoundContent={tStaff("NoTechnicians")}
                    options={staffList.map((x) => ({
                      value: x.id,
                      label: nm(x),
                    }))}
                  />
                </Form.Item>
                {can("technicians.create") && (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    title={tStaff("New")}
                    onClick={() => setAddingStaff(true)}
                  />
                )}
              </Space.Compact>
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item
              name="day"
              label={t("Day")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
            >
              <DayPicker />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item
              name="time"
              label={t("Time")}
              tooltip={t("TimeHint")}
              rules={[
                { required: true, message: tAlerts("RequiredField") },
                { pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: "HH:mm" },
              ]}
            >
              <AutoComplete
                dir="ltr"
                placeholder="17:30"
                options={slots.map((s) => ({ value: s.time }))}
                filterOption={(input, o) => o.value.startsWith(input)}
              />
            </Form.Item>
          </Col>
          {settings.bookingHome !== false && (
            <Col xs={24}>
              <Form.Item
                name="atHome"
                label={t("AtHome")}
                valuePropName="checked"
                className="mb-2"
              >
                <Switch />
              </Form.Item>
            </Col>
          )}
          {atHome && (
            <>
              <Col xs={24} md={12}>
                <Form.Item name="address" label={t("Address")}>
                  <Input maxLength={500} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="locationUrl" label={t("Location")}>
                  <Input
                    dir="ltr"
                    maxLength={500}
                    placeholder="https://maps..."
                  />
                </Form.Item>
              </Col>
            </>
          )}
          <Col xs={24}>
            <Form.Item name="notes" label={t("Notes")} className="mb-0">
              <Input.TextArea rows={2} maxLength={500} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
      {addingStaff && (
        <QuickTechnician
          onClose={() => setAddingStaff(false)}
          onAdded={(x) => {
            setNewStaff((p) => [...p, x]);
            form.setFieldValue("technicianId", x.id);
            setAddingStaff(false);
          }}
        />
      )}
    </Modal>
  );
}

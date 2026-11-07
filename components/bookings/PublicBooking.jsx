"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  Form,
  Input,
  Result,
  Row,
  Segmented,
  Select,
  Spin,
  Switch,
  Tag,
} from "antd";
import {
  CalendarOutlined,
  CheckCircleFilled,
  SearchOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useLocale, useTranslations } from "next-intl";
import DayPicker from "@/components/common/DayPicker";
import { imageUrl } from "@/lib/image";
import { formatDay, today } from "@/lib/dates";
import {
  publicCreateBookingAction,
  publicFindBookingAction,
  publicSlotsAction,
} from "@/actions/booking.actions";
import { listSep } from "@/lib/list-sep";
import { C } from "@/lib/theme";
import "./public-booking.css";

// ============================================================
// صفحة الحجز للعملاء (من غير تسجيل دخول)
// الفرع ← الخدمات ← (مقدم الخدمة) ← اليوم والساعة الفاضية ← الاسم والجوال
// بعد الحجز: رقم الحجز (العميل بيقوله في المحل)
// ============================================================
export default function PublicBooking({ code, info }) {
  const t = useTranslations("PublicBooking");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [tab, setTab] = useState("book");

  if (!info)
    return (
      <Shell>
        <Unavailable t={t} />
      </Shell>
    );
  const { settings, company, branches, services, staff } = info;
  if (!settings.bookingOnline || !branches.length)
    return (
      <Shell company={company} code={code} nm={nm}>
        <Unavailable t={t} />
      </Shell>
    );

  return (
    <Shell company={company} code={code} nm={nm}>
      <Segmented
        block
        className="mb-3"
        value={tab}
        onChange={setTab}
        options={[
          { value: "book", label: t("NewBooking"), icon: <CalendarOutlined /> },
          { value: "find", label: t("MyBooking"), icon: <SearchOutlined /> },
        ]}
      />
      {tab === "book" ? (
        <BookingForm
          code={code}
          settings={settings}
          branches={branches}
          services={services}
          staff={staff}
          t={t}
          tAlerts={tAlerts}
          nm={nm}
        />
      ) : (
        <FindBooking code={code} t={t} tAlerts={tAlerts} nm={nm} />
      )}
    </Shell>
  );
}

function Shell({ company, code, nm, children }) {
  const locale = useLocale();
  return (
    <div className="pb-page" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="pb-wrap">
        {company && (
          <div className="pb-head">
            {company.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${imageUrl(company.logo)}?c=${encodeURIComponent(code)}`}
                alt=""
                className="pb-logo"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
            <div>
              <div className="pb-company">{nm(company)}</div>
              {company.phone && <bdi className="pb-phone">{company.phone}</bdi>}
            </div>
          </div>
        )}
        <Card className="pb-card">{children}</Card>
      </div>
    </div>
  );
}

function Unavailable({ t }) {
  return (
    <Result
      status="info"
      title={t("Unavailable")}
      subTitle={t("UnavailableHint")}
    />
  );
}

function BookingForm({
  code,
  settings,
  branches,
  services,
  staff,
  t,
  tAlerts,
  nm,
}) {
  const [form] = Form.useForm();
  const [slots, setSlots] = useState(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  // فرع واحد: مفيش حقل للفرع في الفورم، فبناخد الفرع الوحيد
  const branchId = Form.useWatch("branchId", form) ?? branches[0]?.id;
  const serviceIds = Form.useWatch("serviceIds", form) ?? [];
  const technicianId = Form.useWatch("technicianId", form);
  const day = Form.useWatch("day", form);
  const time = Form.useWatch("time", form);
  const atHome = Form.useWatch("atHome", form);
  const lastDay = dayjs()
    .add(settings.bookingDaysAhead ?? 30, "day")
    .format("YYYY-MM-DD");

  const servicesKey = serviceIds.join(",");

  // المواعيد الفاضية
  useEffect(() => {
    if (!branchId || !day || !servicesKey) {
      setSlots(null);
      return;
    }
    let alive = true;
    setSlots("loading");
    publicSlotsAction({
      code,
      branchId,
      day,
      serviceIds: servicesKey.split(",").map(Number),
      technicianId: technicianId ?? null,
    }).then((res) => {
      if (!alive) return;
      setSlots(res.success ? res.data : []);
    });
    return () => {
      alive = false;
    };
  }, [code, branchId, day, servicesKey, technicianId]);

  // الساعة المختارة ما بقتش متاحة
  useEffect(() => {
    if (Array.isArray(slots) && time && !slots.some((s) => s.time === time))
      form.setFieldValue("time", undefined);
  }, [slots, time, form]);

  const submit = async (v) => {
    setError(null);
    setSaving(true);
    const res = await publicCreateBookingAction({
      code,
      branchId: v.branchId ?? branchId,
      customerName: v.customerName,
      phone: v.phone,
      technicianId: v.technicianId ?? null,
      serviceIds: v.serviceIds,
      day: v.day,
      time: v.time,
      atHome: Boolean(v.atHome),
      address: v.address ?? null,
      locationUrl: v.locationUrl ?? null,
      notes: v.notes ?? null,
    });
    setSaving(false);
    if (!res.success)
      return setError(tAlerts(res.error, res.details ?? undefined));
    setDone(res.data);
  };

  if (done)
    return (
      <Result
        icon={<CheckCircleFilled style={{ color: C.success }} />}
        title={t("Booked")}
        subTitle={t("BookedHint")}
        extra={[
          <div key="no" className="pb-number">
            BK-{done.number}
          </div>,
          <BookingSummary key="s" b={done} t={t} nm={nm} />,
          <Button
            key="again"
            onClick={() => {
              setDone(null);
              form.resetFields();
            }}
          >
            {t("BookAnother")}
          </Button>,
        ]}
      />
    );

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      autoComplete="off"
      onFinish={submit}
      initialValues={{
        branchId: branches[0]?.id,
        day: today(),
        atHome: false,
        serviceIds: [],
      }}
    >
      {settings.bookingNote && (
        <Alert
          type="info"
          showIcon
          className="mb-3"
          title={settings.bookingNote}
        />
      )}
      {branches.length > 1 && (
        <Form.Item name="branchId" label={t("Branch")}>
          <Select
            options={branches.map((b) => ({ value: b.id, label: nm(b) }))}
          />
        </Form.Item>
      )}
      <Form.Item
        name="serviceIds"
        label={t("Services")}
        rules={[{ required: true, message: t("PickServices") }]}
      >
        <ServicesPicker services={services} nm={nm} t={t} />
      </Form.Item>
      <Row gutter={12}>
        {staff.length > 0 && (
          <Col xs={24} md={12}>
            <Form.Item name="technicianId" label={t("Staff")}>
              <Select
                allowClear
                placeholder={t("AnyStaff")}
                options={staff.map((x) => ({ value: x.id, label: nm(x) }))}
              />
            </Form.Item>
          </Col>
        )}
        <Col xs={24} md={staff.length > 0 ? 12 : 24}>
          <Form.Item
            name="day"
            label={t("Day")}
            rules={[{ required: true, message: tAlerts("RequiredField") }]}
          >
            <DayPicker min={today()} max={lastDay} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item
        name="time"
        label={t("Time")}
        rules={[{ required: true, message: t("PickTime") }]}
      >
        <SlotPicker slots={slots} t={t} />
      </Form.Item>
      <Row gutter={12}>
        <Col xs={24} md={12}>
          <Form.Item
            name="customerName"
            label={t("Name")}
            rules={[
              {
                required: true,
                whitespace: true,
                message: tAlerts("RequiredField"),
              },
            ]}
          >
            <Input autoComplete="off" maxLength={150} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="phone"
            label={t("Phone")}
            rules={[
              {
                required: true,
                whitespace: true,
                min: 5,
                message: tAlerts("RequiredField"),
              },
            ]}
          >
            <Input
              autoComplete="off"
              dir="ltr"
              inputMode="tel"
              maxLength={30}
            />
          </Form.Item>
        </Col>
      </Row>
      {settings.bookingHome && (
        <>
          <Form.Item name="atHome" label={t("AtHome")} valuePropName="checked">
            <Switch />
          </Form.Item>
          {atHome && (
            <>
              <Form.Item
                name="address"
                label={t("Address")}
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message: tAlerts("RequiredField"),
                  },
                ]}
              >
                <Input autoComplete="off" maxLength={500} />
              </Form.Item>
              <Form.Item name="locationUrl" label={t("Location")}>
                <Input
                  autoComplete="off"
                  dir="ltr"
                  maxLength={500}
                  placeholder="https://maps..."
                />
              </Form.Item>
            </>
          )}
        </>
      )}
      <Form.Item name="notes" label={t("Notes")}>
        <Input.TextArea
          autoComplete="off"
          autoSize={{ minRows: 1, maxRows: 4 }}
          maxLength={500}
        />
      </Form.Item>
      {error && <Alert type="error" showIcon className="mb-3" title={error} />}
      <Button
        type="primary"
        htmlType="submit"
        size="large"
        block
        loading={saving}
      >
        {t("Confirm")}
      </Button>
    </Form>
  );
}

// اختيار الساعة: أزرار المواعيد الفاضية
function SlotPicker({ value, onChange, slots, t }) {
  if (slots === "loading") return <Spin />;
  if (slots === null)
    return <div className="pb-muted">{t("PickServicesFirst")}</div>;
  if (!slots.length)
    return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("NoSlots")} />
    );
  return (
    <div className="pb-slots">
      {slots.map((s) => (
        <button
          type="button"
          key={s.time}
          className={`pb-slot ${value === s.time ? "is-active" : ""}`}
          onClick={() => onChange(s.time)}
          dir="ltr"
        >
          {s.time}
        </button>
      ))}
    </div>
  );
}

function BookingSummary({ b, t, nm }) {
  const locale = useLocale();
  return (
    <div className="pb-summary">
      <div>
        <span>{t("Day")}</span>
        <b>
          <bdi>
            {formatDay(b.day)} — {b.time}
          </bdi>
        </b>
      </div>
      {b.branch && (
        <div>
          <span>{t("Branch")}</span>
          <b>{nm(b.branch)}</b>
        </div>
      )}
      {b.technician && (
        <div>
          <span>{t("Staff")}</span>
          <b>{nm(b.technician)}</b>
        </div>
      )}
      <div>
        <span>{t("Services")}</span>
        <b>{b.items.map((i) => nm(i)).join(listSep(locale))}</b>
      </div>
      {b.status && (
        <div>
          <span>{t("Status")}</span>
          <Tag>{t(`S_${b.status}`)}</Tag>
        </div>
      )}
    </div>
  );
}

// العميل بيدور على حجزه: خانة واحدة (رقم الحجز أو الجوال)
// - رقم قصير أو BK-12 ← رقم الحجز
// - رقم طويل (7 أرقام أو أكتر) ← الجوال: الحجوزات الجاية بيه
const toLatin = (v) =>
  String(v ?? "")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

function FindBooking({ code, t, tAlerts, nm }) {
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState(null);
  const [error, setError] = useState(null);
  const find = async (v) => {
    const text = toLatin(v.q).trim();
    const digits = text.replace(/\D/g, "");
    if (!digits) return setError(tAlerts("BookingNotFound"));
    const byPhone = digits.length >= 7;
    setBusy(true);
    setError(null);
    const res = await publicFindBookingAction({
      code,
      ...(byPhone ? { phone: text } : { number: Number(digits) }),
    });
    setBusy(false);
    if (!res.success) {
      setFound(null);
      return setError(tAlerts(res.error));
    }
    setFound(res.data);
  };
  return (
    <>
      <Form
        layout="vertical"
        autoComplete="off"
        onFinish={find}
        requiredMark={false}
      >
        <Form.Item
          name="q"
          label={t("FindLabel")}
          extra={t("FindHint")}
          rules={[
            {
              required: true,
              whitespace: true,
              message: tAlerts("RequiredField"),
            },
          ]}
        >
          <Input
            autoComplete="off"
            dir="ltr"
            inputMode="tel"
            placeholder="BK-12 / 05xxxxxxxx"
          />
        </Form.Item>
        <Button
          htmlType="submit"
          type="primary"
          block
          icon={<SearchOutlined />}
          loading={busy}
        >
          {t("Find")}
        </Button>
      </Form>
      {error && <Alert type="error" showIcon className="mt-3" title={error} />}
      {found?.map((b) => (
        <div key={b.number} className="mt-3">
          <div className="pb-number">BK-{b.number}</div>
          <BookingSummary b={b} t={t} nm={nm} />
        </div>
      ))}
    </>
  );
}

// ============================================================
// الخدمات: كروت صغيرة جنب بعض، وبحث لو الخدمات كتير
// كل الخدمات بتفضل موجودة (المخفي بالبحث بس) عشان المختار ميضيعش
// ============================================================
function ServicesPicker({ services, nm, t, value, onChange }) {
  const [q, setQ] = useState("");
  const text = q.trim().toLowerCase();
  const match = (s) =>
    !text ||
    s.arName?.toLowerCase().includes(text) ||
    s.enName?.toLowerCase().includes(text);
  const shown = services.filter(match).length;
  return (
    <>
      {services.length > 8 && (
        <Input
          autoComplete="off"
          allowClear
          className="mb-2"
          prefix={<SearchOutlined />}
          placeholder={t("SearchServices")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      <Checkbox.Group className="pb-services" value={value} onChange={onChange}>
        {services.map((s) => (
          <Checkbox
            key={s.id}
            value={s.id}
            className="pb-service"
            style={match(s) ? undefined : { display: "none" }}
          >
            <span className="pb-service__name">{nm(s)}</span>
          </Checkbox>
        ))}
      </Checkbox.Group>
      {!shown && <div className="pb-service__empty">{t("NoServices")}</div>}
    </>
  );
}

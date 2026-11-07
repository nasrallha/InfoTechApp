"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Tag,
} from "antd";
import {
  CalendarOutlined,
  EditOutlined,
  ExportOutlined,
  FileDoneOutlined,
  HomeOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { formatDay, today } from "@/lib/dates";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { showActionError } from "@/components/common/actionError";
import { useCan } from "@/components/auth/AuthProvider";
import { Link } from "@/i18n/routing";
import BookingFormModal from "./BookingFormModal";
import {
  posBookingForSaleAction,
  posBookingSetupAction,
  posBookingsAction,
} from "@/actions/booking.actions";
import { listSep } from "@/lib/list-sep";
import { C } from "@/lib/theme";

const COLORS = { booked: C.info, arrived: C.warning };

// ============================================================
// الكاشير: البحث عن حجز (رقم الحجز / الجوال / الاسم) وتحويله لفاتورة
// من غير بحث: حجوزات اليوم المفتوحة (والمتأخر)
// initialQ: جوال العميل المختار في السلة (لو موجود)
// onPick(booking): بيانات الحجز للسلة (الخدمات بمقدم الخدمة + العميل)
// حجز جديد / تعديل حجز من الكاشير نفسه (بالصلاحية)، وشاشة الحجوزات في تاب جديد
// customers: عملاء الكاشير (لاختيار العميل في الحجز)
// ============================================================
export default function PosBookingsModal({
  open,
  initialQ = "",
  hasItems = false,
  customers = [],
  onClose,
  onPick,
}) {
  const can = useCan();
  const t = useTranslations("Bookings");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [q, setQ] = useState(initialQ);
  const [search, setSearch] = useState(initialQ);
  const [result, setResult] = useState({ key: null, rows: [] });
  const [picking, setPicking] = useState(null);
  const inputRef = useRef(null);
  // إضافة / تعديل حجز: البيانات بتتحمل أول مرة بس
  const [setup, setSetup] = useState(null);
  const [editing, setEditing] = useState(null);
  const [opening, setOpening] = useState(false);
  const [reload, setReload] = useState(0);

  const openForm = async (booking = null) => {
    if (setup) return setEditing({ booking });
    setOpening(true);
    const res = await posBookingSetupAction();
    setOpening(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    setSetup(res.data);
    setEditing({ booking });
  };

  useEffect(() => {
    if (!open) return;
    let alive = true;
    posBookingsAction({ q: search }).then((res) => {
      if (!alive) return;
      if (!res.success) showActionError(res, tAlerts, locale);
      setResult({
        key: `${search}|${reload}`,
        rows: res.success ? res.data : [],
      });
    });
    return () => {
      alive = false;
    };
  }, [open, search, reload, tAlerts, locale]);

  const pick = async (b) => {
    setPicking(b.id);
    const res = await posBookingForSaleAction(b.id);
    setPicking(null);
    if (!res.success) return showActionError(res, tAlerts, locale);
    onPick(res.data);
  };

  const loading = result.key !== `${search}|${reload}`;
  const todayDay = today();

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      title={t("PosTitle")}
      destroyOnHidden
      afterOpenChange={(v) => v && inputRef.current?.focus()}
    >
      <Space wrap className="mb-2">
        {can("bookings.create") && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            loading={opening && !editing}
            onClick={() => openForm()}
          >
            {t("New")}
          </Button>
        )}
        {can("bookings.view") && (
          <Link href="/bookings" target="_blank">
            <Button icon={<ExportOutlined />}>{t("OpenScreen")}</Button>
          </Link>
        )}
      </Space>
      <Input.Search
        ref={inputRef}
        allowClear
        enterButton
        autoComplete="off"
        placeholder={t("SearchPlaceholder")}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          if (!e.target.value) setSearch("");
        }}
        onSearch={(v) => setSearch(v.trim())}
        className="mb-3"
      />
      <div style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>
        {search ? t("PosSearchHint") : t("PosTodayHint")}
      </div>
      <Spin spinning={loading}>
        {!result.rows.length ? (
          <Empty description={t("PosNoBookings")} />
        ) : (
          result.rows.map((b) => {
            const btn = (
              <Button
                type="primary"
                size="small"
                icon={<FileDoneOutlined />}
                loading={picking === b.id}
                onClick={hasItems ? undefined : () => pick(b)}
              >
                {t("ToInvoice")}
              </Button>
            );
            return (
              <div
                key={b.id}
                className="pos-line"
                style={{ borderInlineStart: `3px solid ${COLORS[b.status]}` }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="pos-line__name">
                    <bdi>BK-{b.number}</bdi> ·{" "}
                    <bdi dir="ltr">
                      {b.day !== todayDay && `${formatDay(b.day)} `}
                      {b.time}
                    </bdi>{" "}
                    · {b.customer ? nm(b.customer) : b.customerName}
                    {b.phone && (
                      <bdi style={{ color: C.muted, marginInlineStart: 6 }}>
                        {b.phone}
                      </bdi>
                    )}
                  </div>
                  <div className="pos-line__meta">
                    {b.items.map((i) => nm(i)).join(listSep(locale))}
                    {b.technician && ` · ${nm(b.technician)}`}{" "}
                    <Tag color={COLORS[b.status]} style={{ marginInline: 4 }}>
                      {t(`S_${b.status}`)}
                    </Tag>
                    {b.atHome && <HomeOutlined style={{ color: C.purple }} />}
                  </div>
                </div>
                <div className="pos-line__total">{money(b.total)}</div>
                <div className="pos-line__controls">
                  {can("bookings.update") && (
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openForm(b)}
                    >
                      {t("Edit")}
                    </Button>
                  )}
                  {hasItems ? (
                    <Popconfirm
                      title={t("PosReplaceCart")}
                      onConfirm={() => pick(b)}
                    >
                      {btn}
                    </Popconfirm>
                  ) : (
                    btn
                  )}
                </div>
              </div>
            );
          })
        )}
      </Spin>
      {editing && setup && (
        <BookingFormModal
          booking={editing.booking}
          services={setup.services}
          staff={setup.staff}
          settings={setup.settings}
          customers={customers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setReload((n) => n + 1);
          }}
        />
      )}
    </Modal>
  );
}

// ============================================================
// تنبيه في السلة: العميل المختار عنده حجز النهارده لسه مفتوح
// - تحميل الخدمات: السلة بتتبدل بخدمات الحجز
// - ربط بالفاتورة: السلة زي ما هي، والحجز يتقفل «تم» مع الفاتورة
// ============================================================
export function CustomerBookingHint({ customerId, hasItems, onPick, onLink }) {
  const t = useTranslations("Bookings");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [result, setResult] = useState({ key: null, rows: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    let alive = true;
    posBookingsAction({ customerId }).then((res) => {
      if (alive)
        setResult({ key: customerId, rows: res.success ? res.data : [] });
    });
    return () => {
      alive = false;
    };
  }, [customerId]);

  const b = customerId && result.key === customerId ? result.rows[0] : null;
  if (!b) return null;

  const load = async () => {
    setBusy(true);
    const res = await posBookingForSaleAction(b.id);
    setBusy(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    onPick(res.data);
  };

  const loadBtn = (
    <Button size="small" type="primary" loading={busy}>
      {t("LoadServices")}
    </Button>
  );

  return (
    <Alert
      className="mb-2"
      type="info"
      showIcon
      icon={<CalendarOutlined />}
      title={
        <span>
          {t("CustomerHasBooking", { number: `BK-${b.number}` })}{" "}
          <bdi dir="ltr">{b.time}</bdi> · {b.items.map((i) => nm(i)).join(listSep(locale))}
        </span>
      }
      action={
        <Space size={4} wrap>
          {hasItems ? (
            <>
              <Popconfirm title={t("PosReplaceCart")} onConfirm={load}>
                {loadBtn}
              </Popconfirm>
              <Button size="small" onClick={() => onLink(b)}>
                {t("LinkToInvoice")}
              </Button>
            </>
          ) : (
            <Button size="small" type="primary" loading={busy} onClick={load}>
              {t("LoadServices")}
            </Button>
          )}
        </Space>
      }
    />
  );
}

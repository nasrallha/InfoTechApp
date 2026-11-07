"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Col,
  Dropdown,
  Empty,
  Input,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
} from "antd";
import {
  CalendarOutlined,
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  EnvironmentOutlined,
  GlobalOutlined,
  HomeOutlined,
  LeftOutlined,
  LoginOutlined,
  MoreOutlined,
  PlusOutlined,
  RightOutlined,
  RollbackOutlined,
  ShoppingCartOutlined,
  StopOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import StatusFilters from "@/components/common/StatusFilters";
import DayPicker from "@/components/common/DayPicker";
import ExportButtons from "@/components/reports/ExportButtons";
import { message, modal } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCan } from "@/components/auth/AuthProvider";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useStaffT } from "@/components/technicians/useStaffT";
import { Link, useRouter } from "@/i18n/routing";
import { formatDay, today } from "@/lib/dates";
import { saleDocNo } from "@/lib/doc-number";
import {
  listBookingsAction,
  setBookingStatusAction,
} from "@/actions/booking.actions";
import BookingFormModal from "./BookingFormModal";
import { listSep } from "@/lib/list-sep";
import { C } from "@/lib/theme";
import "@/components/common/status-colors.css";
import "./bookings.css";

export const BOOKING_COLORS = {
  all: C.purple,
  booked: C.info,
  arrived: C.warning,
  done: C.success,
  cancelled: C.muted,
  noShow: C.danger,
};
const STATUSES = ["all", "booked", "arrived", "done", "noShow", "cancelled"];
const ACTIVE = ["booked", "arrived"];
const addDay = (d, n) => dayjs(d).add(n, "day").format("YYYY-MM-DD");

// ============================================================
// الحجوزات: اليوم (لوحة لكل مقدم خدمة) + التقرير (فترة) + البحث برقم الحجز
// ============================================================
export default function BookingsView({
  services = [],
  staff = [],
  customers = [],
  settings = {},
  initialQ = "",
}) {
  const t = useTranslations("Bookings");
  const tButtons = useTranslations("Buttons");
  const tStaff = useStaffT();
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const can = useCan();
  const router = useRouter();
  const { amount: money } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [mode, setMode] = useState("day");
  const [day, setDay] = useState(today());
  const [range, setRange] = useState(() => ({
    from: `${today().slice(0, 7)}-01`,
    to: today(),
  }));
  const [status, setStatus] = useState("all");
  const [technicianId, setTechnicianId] = useState(undefined);
  const [text, setText] = useState(initialQ);
  const [q, setQ] = useState(initialQ);
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState({ key: null, rows: [], counts: {} });
  const [editing, setEditing] = useState(null); // { booking } | { new, initial }

  const filters =
    mode === "day"
      ? { from: day, to: day, q, tick }
      : { ...range, technicianId, q, tick };
  const key = JSON.stringify(filters);
  const load = useCallback(() => {
    // tick: إعادة التحميل بس (مش فلتر)
    const f = JSON.parse(key);
    delete f.tick;
    return listBookingsAction(f);
  }, [key]);

  useEffect(() => {
    let alive = true;
    load().then((res) => {
      if (!alive) return;
      if (!res.success) showActionError(res, tAlerts, locale);
      setResult((prev) =>
        res.success
          ? { key, rows: res.data.rows, counts: res.data.counts }
          : { ...prev, key },
      );
    });
    return () => {
      alive = false;
    };
  }, [load, key, tAlerts, locale]);

  useEffect(() => {
    const timer = setTimeout(() => setQ(text), 350);
    return () => clearTimeout(timer);
  }, [text]);

  const refresh = () => setTick((x) => x + 1);
  const rows = result.rows.filter(
    (r) => status === "all" || r.status === status,
  );

  const changeStatus = async (b, next) => {
    const res = await setBookingStatusAction({ id: b.id, status: next });
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t(`Status_${next}`));
    refresh();
  };
  const confirmStatus = (b, next) =>
    modal.confirm({
      title: t(`Confirm_${next}`, { number: `BK-${b.number}` }),
      okText: t("Yes"),
      cancelText: t("No"),
      okButtonProps: { danger: next === "cancelled" || next === "noShow" },
      onOk: () => changeStatus(b, next),
    });

  // الفاتورة من الحجز: الكاشير أو فاتورة البيع
  const invoiceItems = (b) => [
    can("sales.pos") && {
      key: "pos",
      icon: <ShoppingCartOutlined />,
      label: t("ToPos"),
      onClick: () => router.push(`/pos?booking=${b.id}`),
    },
    can("sales.create") && {
      key: "sale",
      icon: <ShoppingCartOutlined />,
      label: t("ToSale"),
      onClick: () => router.push(`/invoices/sales/new?booking=${b.id}`),
    },
  ];

  const actions = (b) => {
    const active = ACTIVE.includes(b.status);
    const items = [
      active &&
        b.status === "booked" && {
          key: "arrived",
          icon: <LoginOutlined />,
          label: t("MarkArrived"),
          onClick: () => changeStatus(b, "arrived"),
        },
      ...(active ? invoiceItems(b) : []),
      active && {
        key: "done",
        icon: <CheckOutlined />,
        label: t("MarkDoneNoInvoice"),
        onClick: () => confirmStatus(b, "done"),
      },
      active &&
        can("bookings.update") && {
          key: "edit",
          icon: <EditOutlined />,
          label: t("Edit"),
          onClick: () => setEditing({ booking: b }),
        },
      active && {
        key: "noShow",
        icon: <StopOutlined />,
        label: t("MarkNoShow"),
        danger: true,
        onClick: () => confirmStatus(b, "noShow"),
      },
      active &&
        can("bookings.cancel") && {
          key: "cancelled",
          icon: <CloseOutlined />,
          label: t("Cancel"),
          danger: true,
          onClick: () => confirmStatus(b, "cancelled"),
        },
      !active &&
        !b.saleId &&
        (b.status === "cancelled" || b.status === "noShow") && {
          key: "back",
          icon: <RollbackOutlined />,
          label: t("BackToBooked"),
          onClick: () => changeStatus(b, "booked"),
        },
    ].filter(Boolean);
    return can("bookings.update")
      ? items
      : items.filter((i) => i.key !== "edit");
  };

  // ---------- كارت الحجز ----------
  const BookingCard = ({ b }) => (
    <div className="bk-card" style={{ "--c": BOOKING_COLORS[b.status] }}>
      <div className="bk-card__top">
        <b dir="ltr">
          {b.time} – {b.endTime}
        </b>
        <Tag color={BOOKING_COLORS[b.status]}>{t(`S_${b.status}`)}</Tag>
        <span className="bk-card__no">BK-{b.number}</span>
        <Dropdown menu={{ items: actions(b) }} trigger={["click"]}>
          <Button aria-label={tButtons("More")} title={tButtons("More")} size="small" type="text" icon={<MoreOutlined />} />
        </Dropdown>
      </div>
      <div className="bk-card__name">
        {b.customerName}{" "}
        <bdi style={{ color: C.muted, fontSize: 12 }}>{b.phone}</bdi>
      </div>
      <div className="bk-card__services">
        {b.items.map((i) => nm(i)).join(listSep(locale))}
      </div>
      <div className="bk-card__tags">
        {b.atHome && (
          <Tooltip title={b.address}>
            <Tag icon={<HomeOutlined />} color="purple">
              {t("AtHome")}
            </Tag>
          </Tooltip>
        )}
        {b.locationUrl && (
          <a href={b.locationUrl} target="_blank" rel="noreferrer">
            <Tag icon={<EnvironmentOutlined />}>{t("Location")}</Tag>
          </a>
        )}
        {b.source === "online" && (
          <Tag icon={<GlobalOutlined />} color="cyan">
            {t("Online")}
          </Tag>
        )}
        {b.sale && (
          <Link href={`/invoices/sales/${b.sale.id}`}>
            <Tag color="green">{saleDocNo("sale", b.sale.number)}</Tag>
          </Link>
        )}
        {ACTIVE.includes(b.status) &&
          invoiceItems(b).filter(Boolean).length > 0 && (
            <Button
              size="small"
              type="primary"
              icon={<ShoppingCartOutlined />}
              onClick={invoiceItems(b).filter(Boolean)[0].onClick}
            >
              {t("Invoice")}
            </Button>
          )}
      </div>
      {b.notes && <div className="bk-card__notes">{b.notes}</div>}
    </div>
  );

  // ---------- لوحة اليوم: عمود لكل مقدم خدمة ----------
  const columns = [
    ...staff.map((s) => ({ id: s.id, name: nm(s) })),
    { id: null, name: t("NoStaff") },
  ]
    .map((c) => ({
      ...c,
      list: rows.filter((r) => (r.technicianId ?? null) === c.id),
    }))
    .filter((c) => c.id !== null || c.list.length);

  const build = () => ({
    title: t("ReportTitle"),
    fileName: `bookings-${range.from}-${range.to}`,
    landscape: true,
    info: [
      [t("Period"), `${formatDay(range.from)} — ${formatDay(range.to)}`],
      ...(status !== "all" ? [[t("Status"), t(`S_${status}`)]] : []),
    ],
    summary: STATUSES.filter((s) => s !== "all").map((s) => [
      t(`S_${s}`),
      result.counts?.[s] ?? 0,
    ]),
    columns: [
      { title: t("Number"), key: "no" },
      { title: t("Day"), key: "day" },
      { title: t("Time"), key: "time" },
      { title: t("Customer"), key: "customer" },
      { title: t("Phone"), key: "phone" },
      { title: tStaff("Technician"), key: "staff" },
      { title: t("Services"), key: "services" },
      { title: t("Total"), key: "total", type: "money" },
      { title: t("Status"), key: "status" },
      { title: t("Invoice"), key: "invoice" },
    ],
    rows: rows.map((b) => ({
      key: b.id,
      no: `BK-${b.number}`,
      day: formatDay(b.day),
      time: `${b.time} - ${b.endTime}`,
      customer: b.customerName,
      phone: b.phone,
      staff: nm(b.technician) || "—",
      services: b.items.map((i) => nm(i)).join(listSep(locale)),
      total: b.total,
      status: t(`S_${b.status}`),
      invoice: b.sale ? saleDocNo("sale", b.sale.number) : "",
    })),
    totals: { total: rows.reduce((s, b) => s + b.total, 0) },
  });

  return (
    <>
      <PageHeader
        title={t("Title")}
        extra={
          <Space wrap>
            {mode === "report" && (
              <ExportButtons disabled={!rows.length} build={build} />
            )}
            {can("bookings.create") && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() =>
                  setEditing({
                    new: true,
                    initial: { day: mode === "day" ? day : today() },
                  })
                }
              >
                {t("New")}
              </Button>
            )}
          </Space>
        }
      />

      <Card size="small" className="mb-3">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={6}>
            <Segmented
              block
              value={mode}
              onChange={setMode}
              options={[
                { value: "day", label: t("DayBoard") },
                { value: "report", label: t("Report") },
              ]}
            />
          </Col>
          {mode === "day" ? (
            <Col xs={24} md={8}>
              <Space.Compact style={{ width: "100%" }}>
                <Button
                  icon={locale === "ar" ? <RightOutlined /> : <LeftOutlined />}
                  onClick={() => setDay(addDay(day, -1))}
                />
                <DayPicker value={day} onChange={(v) => v && setDay(v)} />
                <Button
                  icon={locale === "ar" ? <LeftOutlined /> : <RightOutlined />}
                  onClick={() => setDay(addDay(day, 1))}
                />
                <Button onClick={() => setDay(today())}>{t("Today")}</Button>
              </Space.Compact>
            </Col>
          ) : (
            <>
              <Col xs={12} md={4}>
                <DayPicker
                  value={range.from}
                  onChange={(v) => v && setRange((p) => ({ ...p, from: v }))}
                />
              </Col>
              <Col xs={12} md={4}>
                <DayPicker
                  value={range.to}
                  onChange={(v) => v && setRange((p) => ({ ...p, to: v }))}
                />
              </Col>
              <Col xs={24} md={4}>
                <Select
                  allowClear
                  style={{ width: "100%" }}
                  placeholder={tStaff("AllTechnicians")}
                  value={technicianId}
                  onChange={(v) => setTechnicianId(v ?? undefined)}
                  options={staff.map((s) => ({ value: s.id, label: nm(s) }))}
                />
              </Col>
            </>
          )}
          <Col xs={24} md={mode === "day" ? 10 : 6}>
            <Input.Search
              enterButton
              allowClear
              value={text}
              onChange={(e) => setText(e.target.value)}
              // Enter أو زر البحث ← بحث على طول (من غير انتظار)
              onSearch={(v) => {
                setText(v);
                setQ(v);
              }}
              placeholder={t("SearchPlaceholder")}
            />
          </Col>
        </Row>
        {q && (
          <div className="mt-2" style={{ color: C.muted, fontSize: 12 }}>
            {t("SearchAllDates")}
          </div>
        )}
      </Card>

      <StatusFilters
        className="mb-3"
        value={status}
        onChange={setStatus}
        options={STATUSES.map((s) => ({
          value: s,
          label: t(`S_${s}`),
          color: BOOKING_COLORS[s],
          count: result.counts?.[s] ?? 0,
        }))}
      />

      {result.key !== key && !result.rows.length ? (
        <Spin />
      ) : mode === "day" && !q ? (
        rows.length ? (
          <div className="bk-board">
            {columns.map((c) => (
              <div key={c.id ?? "none"} className="bk-col">
                <div className="bk-col__head">
                  {c.name} <Tag>{c.list.length}</Tag>
                </div>
                {c.list.map((b) => (
                  <BookingCard key={b.id} b={b} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <Empty
            image={<CalendarOutlined style={{ fontSize: 48, color: C.subtle }} />}
            description={t("NoBookingsDay")}
          />
        )
      ) : (
        <Table
          className="sc-table"
          size="small"
          rowKey="id"
          rowClassName={() => "sc-row"}
          onRow={(r) => ({ style: { "--c": BOOKING_COLORS[r.status] } })}
          loading={result.key !== key}
          dataSource={rows}
          pagination={{
            pageSize: 50,
            showSizeChanger: false,
            hideOnSinglePage: true,
          }}
          scroll={{ x: 1100 }}
          columns={[
            {
              title: t("Number"),
              width: 90,
              render: (_, b) => <b>BK-{b.number}</b>,
            },
            {
              title: t("Day"),
              width: 150,
              render: (_, b) => (
                <bdi>
                  {formatDay(b.day)} {b.time}
                </bdi>
              ),
            },
            {
              title: t("Customer"),
              render: (_, b) => (
                <>
                  {b.customerName}
                  <div style={{ color: C.muted, fontSize: 12 }}>
                    <bdi>{b.phone}</bdi>
                  </div>
                </>
              ),
            },
            {
              title: tStaff("Technician"),
              width: 130,
              render: (_, b) => nm(b.technician) || "—",
            },
            {
              title: t("Services"),
              render: (_, b) => b.items.map((i) => nm(i)).join(listSep(locale)),
            },
            {
              title: t("Total"),
              width: 110,
              align: "end",
              render: (_, b) => money(b.total),
            },
            {
              title: t("Status"),
              width: 170,
              render: (_, b) => (
                <>
                  <Tag color={BOOKING_COLORS[b.status]}>
                    {t(`S_${b.status}`)}
                  </Tag>
                  {b.source === "online" && (
                    <GlobalOutlined title={t("Online")} />
                  )}
                  {b.sale && (
                    <Link
                      href={`/invoices/sales/${b.sale.id}`}
                      className="ms-1"
                    >
                      {saleDocNo("sale", b.sale.number)}
                    </Link>
                  )}
                </>
              ),
            },
            {
              title: "",
              width: 50,
              render: (_, b) =>
                actions(b).length ? (
                  <Dropdown menu={{ items: actions(b) }} trigger={["click"]}>
                    <Button aria-label={tButtons("More")} title={tButtons("More")} size="small" type="text" icon={<MoreOutlined />} />
                  </Dropdown>
                ) : null,
            },
          ]}
        />
      )}

      {editing && (
        <BookingFormModal
          booking={editing.booking ?? null}
          initial={editing.initial ?? {}}
          services={services}
          staff={staff}
          customers={customers}
          settings={settings}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}

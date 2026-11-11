"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Drawer,
  Empty,
  Input,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import StatusFilters from "@/components/common/StatusFilters";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCan } from "@/components/auth/AuthProvider";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { Link } from "@/i18n/routing";
import { formatDate } from "@/lib/dates";
import { saleDocNo } from "@/lib/doc-number";
import {
  deleteVehicleAction,
  listVehiclesAction,
  vehicleHistoryAction,
} from "@/actions/vehicle.actions";
import VehicleFormModal from "./VehicleFormModal";
import { CHANGE_COLORS, changeText } from "./VehiclePicker";
import { C } from "@/lib/theme";
import "@/components/common/status-colors.css";

const FILTER_COLORS = { all: C.info, due: C.danger };
const LEVEL_HEX = { overdue: C.danger, soon: C.warning, later: C.success };

// ============================================================
// السيارات (وحدة vehicles - الورش)
// البحث باللوحة / النوع / العميل / الجوال، والغيار الجاي لكل سيارة
// "الغيار جه أو قرب": ميعاده بالتاريخ فات أو خلال أسبوع
// السجل: كل فواتير السيارة بالعداد والأصناف
// ============================================================
// initialQ / initialFilter: من اللينك (?q=اللوحة من الإشعار أو الفاتورة، ?filter=due)
export default function VehiclesView({
  customers = [],
  initialQ = "",
  initialFilter = "all",
}) {
  const t = useTranslations("Vehicles");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const locale = useLocale();
  const can = useCan();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [filter, setFilter] = useState(initialFilter);
  const [text, setText] = useState(initialQ);
  const [q, setQ] = useState(initialQ);
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState({ key: null, rows: [], counts: {} });
  const [editing, setEditing] = useState(null); // { vehicle } | { new: true }
  const [historyId, setHistoryId] = useState(null);
  const key = JSON.stringify({ filter, q, tick });

  const load = useCallback(() => listVehiclesAction(JSON.parse(key)), [key]);
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

  // البحث بعد توقف قصير
  useEffect(() => {
    const timer = setTimeout(() => setQ(text), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const refresh = () => setTick((x) => x + 1);

  const remove = async (v) => {
    const res = await deleteVehicleAction(v.id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Deleted"));
    refresh();
  };

  return (
    <>
      <PageHeader
        title={t("Title")}
        extra={
          can("vehicles.create") && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setEditing({ new: true })}
            >
              {t("New")}
            </Button>
          )
        }
      />
      <Card size="small" className="mb-3">
        <StatusFilters
          className="mb-3"
          value={filter}
          onChange={setFilter}
          options={["all", "due"].map((f) => ({
            value: f,
            label: t(`Filter_${f}`),
            color: FILTER_COLORS[f],
            count: result.counts?.[f] ?? 0,
          }))}
        />
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
          style={{ maxWidth: 420 }}
        />
      </Card>

      <Table
        className="sc-table"
        size="small"
        rowKey="id"
        rowClassName={() => "sc-row"}
        onRow={(r) => ({
          style: {
            "--c": LEVEL_HEX[r.change?.level] ?? C.borderStrong,
          },
        })}
        loading={result.key !== key}
        dataSource={result.rows}
        pagination={{
          pageSize: 50,
          showSizeChanger: false,
          hideOnSinglePage: true,
        }}
        scroll={{ x: 1000 }}
        columns={[
          {
            title: t("PlateNo"),
            width: 140,
            render: (_, r) => (
              <b style={{ letterSpacing: 1 }}>
                <bdi>{r.plateNo}</bdi>
              </b>
            ),
          },
          {
            title: t("VehicleType"),
            dataIndex: "vehicleType",
            width: 150,
            render: (v) => v || "—",
          },
          {
            title: t("Customer"),
            render: (_, r) => (
              <>
                {nm(r.customer) || t("NoCustomer")}
                {(r.phone || r.customer?.phone) && (
                  <div style={{ color: C.muted, fontSize: 12 }}>
                    <bdi>{r.phone || r.customer?.phone}</bdi>
                  </div>
                )}
              </>
            ),
          },
          {
            title: t("LastVisit"),
            width: 130,
            render: (_, r) =>
              r.lastVisit ? (
                <>
                  <bdi>{formatDate(r.lastVisit)}</bdi>
                  {r.lastOdometer != null && (
                    <div style={{ color: C.muted, fontSize: 12 }}>
                      {Number(r.lastOdometer).toLocaleString("en")} {t("Km")}
                    </div>
                  )}
                </>
              ) : (
                "—"
              ),
          },
          {
            title: t("NextChange"),
            width: 240,
            render: (_, r) =>
              r.change ? (
                <>
                  <Tag color={CHANGE_COLORS[r.change.level] ?? "blue"}>
                    {changeText(t, r.change)}
                  </Tag>
                  <div style={{ color: C.muted, fontSize: 12 }}>
                    {nm(r.change.item)}
                    {r.change.days != null &&
                      ` — ${
                        r.change.days < 0
                          ? t("LateBy", { days: -r.change.days })
                          : r.change.days === 0
                            ? t("Today")
                            : t("InDays", { days: r.change.days })
                      }`}
                  </div>
                </>
              ) : (
                "—"
              ),
          },
          {
            title: "",
            width: 130,
            render: (_, r) => (
              <Space size={4}>
                <Tooltip title={t("History")}>
                  <Button
                    size="small"
                    icon={<HistoryOutlined />}
                    onClick={() => setHistoryId(r.id)}
                  />
                </Tooltip>
                {can("vehicles.update") && (
                  <Tooltip title={t("Edit")}>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => setEditing({ vehicle: r })}
                    />
                  </Tooltip>
                )}
                {can("vehicles.delete") && (
                  <Popconfirm
                    title={t("DeleteConfirm")}
                    onConfirm={() => remove(r)}
                  >
                    <Button aria-label={tButtons("Delete")} title={tButtons("Delete")} size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      {editing && (
        <VehicleFormModal
          vehicle={editing.vehicle ?? null}
          customers={customers}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      {historyId && (
        <HistoryDrawer id={historyId} onClose={() => setHistoryId(null)} />
      )}
    </>
  );
}

// ---------- سجل السيارة: كل الفواتير بالعداد والأصناف ----------
function HistoryDrawer({ id, onClose }) {
  const t = useTranslations("Vehicles");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    vehicleHistoryAction(id).then((res) => {
      if (!alive) return;
      if (!res.success) {
        showActionError(res, tAlerts, locale);
        setData({ vehicle: null, sales: [] });
      } else setData(res.data);
    });
    return () => {
      alive = false;
    };
  }, [id, tAlerts, locale]);

  const v = data?.vehicle;
  return (
    <Drawer
      open
      size="large"
      onClose={onClose}
      title={
        v ? (
          <span>
            {t("History")}: <bdi>{v.plateNo}</bdi>
            {v.vehicleType ? ` — ${v.vehicleType}` : ""}
          </span>
        ) : (
          t("History")
        )
      }
    >
      {!data ? (
        <Spin />
      ) : !data.sales.length ? (
        <Empty description={t("NoHistory")} />
      ) : (
        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {data.sales.map((s) => {
            const isReturn = s.type === "return";
            return (
              <li
                key={s.id}
                style={{
                  borderInlineStart: `4px solid ${isReturn ? C.danger : C.info}`,
                  background: C.bgSubtle,
                  borderRadius: 8,
                  padding: "8px 12px",
                  marginBottom: 10,
                }}
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <b>
                    <bdi>{formatDate(s.date)}</bdi>
                  </b>
                  <Link
                    href={`/invoices/${isReturn ? "sales-returns" : "sales"}/${s.id}`}
                  >
                    <bdi>{saleDocNo(s.type, s.number, s.docCode)}</bdi>
                  </Link>
                  {s.odometer != null && (
                    <Tag color="blue">
                      {t("Odometer")}: {Number(s.odometer).toLocaleString("en")}
                    </Tag>
                  )}
                  <span style={{ marginInlineStart: "auto" }}>
                    <b>{money(s.totalAmount)}</b>
                  </span>
                </div>
                <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                  {s.items.map((i) => (
                    <li key={i.id}>
                      {nm(i)} × {Number(i.qty)}
                      {(i.nextKm != null || i.nextDate) && (
                        <span style={{ color: C.muted, fontSize: 12 }}>
                          {" "}
                          — {t("NextChange")}: {changeText(t, i)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </Drawer>
  );
}

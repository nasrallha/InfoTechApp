"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import {
  DeleteOutlined,
  WalletOutlined,
  EyeOutlined,
  FormOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import PageHeader from "@/components/common/PageHeader";
import SearchBox from "@/components/common/SearchBox";
import DayPicker from "@/components/common/DayPicker";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { formatDate, formatDay } from "@/lib/dates";
import { OPEN_STATUSES, STATUS_COLOR } from "@/lib/tailoring";
import { C } from "@/lib/theme";
import {
  deleteTailorOrderAction,
  deliverTailorOrderAction,
  exportTailorOrdersAction,
  setTailorOrderStatusAction,
} from "@/actions/tailoring.actions";
import ExportButtons from "@/components/reports/ExportButtons";
import PayDueModal from "./PayDueModal";
import CardActions from "./CardActions";

// ============================================================
// طلبات التفصيل: الحالة (المفتوحة / المتأخرة / ...) + بحث
// (رقم الطلب / العميل / الجوال / اسم الشخص) + فترة (الطلب أو التسليم) + الخياط
// تغيير الحالة لأكتر من طلب مرة واحدة (تحت التفصيل / جاهز)
// ============================================================
const STATUS_TABS = [
  "open",
  "late",
  "new",
  "working",
  "ready",
  "delivered",
  "cancelled",
  "all",
];

export default function TailorOrdersList({
  data,
  filters,
  technicians,
  canCreate,
  canUpdate,
  canCollect = false,
  canDelete = false,
  canDeliver = false,
  // الكارت: خانات المقاسات ورسومات التفاصيل
  fields = [],
  groups = [],
  paymentMethods = [],
}) {
  const t = useTranslations("Tailoring");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { amount: money } = useCurrency();
  const [f, setF] = useState(filters);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  // دفع المتبقي من القايمة على طول
  const [payFor, setPayFor] = useState(null);
  const nameOf = (x) =>
    x ? (locale === "ar" ? x.arName : x.enName || x.arName) : "";

  const go = (patch) => {
    const next = { ...f, page: 1, ...patch };
    setF(next);
    const q = new URLSearchParams();
    if (next.status && next.status !== "open") q.set("status", next.status);
    if (next.q) q.set("q", next.q);
    if (next.from) q.set("from", next.from);
    if (next.to) q.set("to", next.to);
    if (next.dateBy !== "order") q.set("dateBy", next.dateBy);
    if (next.technicianId) q.set("tailor", String(next.technicianId));
    if (next.page > 1) q.set("page", String(next.page));
    router.push(`${pathname}${q.toString() ? `?${q}` : ""}`);
  };

  const removeOrder = async (id) => {
    const res = await deleteTailorOrderAction(id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("OrderDeleted"));
  };

  // تغيير مرحلة طلب واحد من القايمة
  // «مُسلَّم»: تسليم من غير تحصيل (المتبقي لو فيه يفضل على العميل)
  const changeStatus = async (id, status) => {
    const res =
      status === "delivered"
        ? await deliverTailorOrderAction({ id })
        : await setTailorOrderStatusAction({ ids: [id], status });
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("StatusUpdated", { n: 1 }));
  };

  const setStatus = async (status) => {
    setBusy(true);
    const res = await setTailorOrderStatusAction({ ids: picked, status });
    setBusy(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("StatusUpdated", { n: res.data.updated }));
    setPicked([]);
  };

  const columns = [
    {
      title: t("OrderNo"),
      dataIndex: "docNo",
      width: 120,
      render: (v, r) => (
        <Link href={`/tailoring/${r.id}`}>
          <b>
            <bdi>{v}</bdi>
          </b>
        </Link>
      ),
    },
    {
      title: t("OrderDate"),
      dataIndex: "orderDate",
      width: 110,
      render: (v) => <bdi>{formatDate(v)}</bdi>,
    },
    {
      title: t("Customer"),
      key: "c",
      width: 190,
      render: (_, r) => (
        <div>
          <div className="font-bold">{nameOf(r.customer)}</div>
          {r.customer.phone && (
            <div className="text-xs text-slate-500">
              <bdi>{r.customer.phone}</bdi>
            </div>
          )}
        </div>
      ),
    },
    {
      title: t("Persons"),
      key: "p",
      width: 180,
      render: (_, r) => r.persons.join("، "),
    },
    { title: t("Pieces"), dataIndex: "pieces", width: 80, align: "center" },
    {
      title: t("DeliveryDate"),
      dataIndex: "deliveryDate",
      width: 115,
      render: (v, r) => (
        <bdi
          style={r.late ? { color: C.dangerText, fontWeight: 700 } : undefined}
        >
          {formatDay(v)}
        </bdi>
      ),
    },
    {
      title: t("Tailor"),
      key: "tl",
      width: 130,
      render: (_, r) => (r.technician ? nameOf(r.technician) : "—"),
    },
    {
      title: t("Total"),
      dataIndex: "total",
      width: 110,
      align: "end",
      render: (v) => money(v),
    },
    {
      title: t("Due"),
      dataIndex: "due",
      width: 110,
      align: "end",
      // مسدد بالكامل ← علامة خضرا (من غير رقم)
      render: (v, r) =>
        v > 0 ? (
          <span style={{ color: C.dangerText }}>{money(v)}</span>
        ) : r.status === "cancelled" ? (
          "—"
        ) : (
          <Tag color="green">{t("FullyPaid")}</Tag>
        ),
    },
    {
      title: t("Status"),
      dataIndex: "status",
      width: 170,
      align: "center",
      // المفتوح: تغيير المرحلة من هنا على طول (جديد / تحت التفصيل / جاهز)
      render: (v, r) => (
        <Space size={4}>
          {canUpdate && OPEN_STATUSES.includes(v) ? (
            <Select
              size="small"
              style={{ width: 120 }}
              value={v}
              onChange={(s) => changeStatus(r.id, s)}
              options={[
                ...OPEN_STATUSES,
                ...(canDeliver ? ["delivered"] : []),
              ].map((s) => ({
                value: s,
                label: <Tag color={STATUS_COLOR[s]}>{t(`st_${s}`)}</Tag>,
              }))}
            />
          ) : (
            <Tag color={STATUS_COLOR[v]}>{t(`st_${v}`)}</Tag>
          )}
          {r.late && <Tag color="red">{t("st_late")}</Tag>}
        </Space>
      ),
    },
    // دفع المتبقي: عمود لوحده بزرار الدفع (للكاشير)
    ...(canCollect
      ? [
          {
            title: t("PayDue"),
            key: "pay",
            width: 110,
            align: "center",
            render: (_, r) =>
              r.due > 0 && r.status !== "cancelled" ? (
                <Button
                  size="small"
                  type="primary"
                  icon={<WalletOutlined />}
                  onClick={() => setPayFor(r)}
                >
                  {t("Pay")}
                </Button>
              ) : null,
          },
        ]
      : []),
    // الإجراءات: عرض / تعديل / حذف (كل واحد بصلاحيته)
    {
      title: t("Actions"),
      key: "act",
      width: 290,
      align: "center",
      render: (_, r) => {
        const open = ["new", "working", "ready"].includes(r.status);
        return (
          <Space size={4} wrap>
            {/* كارت الطلب للخياط */}
            <CardActions
              size="small"
              compact
              orderId={r.id}
              fields={fields}
              groups={groups}
            />
            <Button
              size="small"
              icon={<EyeOutlined />}
              title={t("ViewOrder")}
              onClick={() => router.push(`/tailoring/${r.id}`)}
            />
            {canUpdate && open && (
              <Button
                size="small"
                icon={<FormOutlined />}
                title={t("EditOrder")}
                onClick={() => router.push(`/tailoring/${r.id}/edit`)}
              />
            )}
            {canDelete && (
              <Popconfirm
                title={t("DeleteOrderConfirm")}
                description={
                  <div style={{ maxWidth: 260 }}>{t("DeleteOrderHint")}</div>
                }
                okButtonProps={{ danger: true }}
                onConfirm={() => removeOrder(r.id)}
              >
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  title={t("DeleteOrder")}
                />
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  // ---------------- التصدير (Excel / PDF / طباعة) ----------------
  const loadAll = async () => {
    const res = await exportTailorOrdersAction({
      q: filters.q,
      from: filters.from,
      to: filters.to,
      dateBy: filters.dateBy,
      status: filters.status,
      technicianId: filters.technicianId,
    });
    if (!res.success) {
      showActionError(res, tAlerts, locale);
      return null;
    }
    return res.data;
  };
  const buildExport = (rows = []) => {
    const tech = technicians.find((x) => x.id === filters.technicianId);
    const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
    return {
      title: `${t("OrdersTitle")} - ${t(`st_${filters.status}`)}`,
      info: [
        ...(filters.from || filters.to
          ? [
              [
                t(
                  filters.dateBy === "delivery"
                    ? "ByDeliveryDate"
                    : "ByOrderDate",
                ),
                `${filters.from ? formatDay(filters.from) : "…"} - ${filters.to ? formatDay(filters.to) : "…"}`,
              ],
            ]
          : []),
        ...(tech ? [[t("Tailor"), nameOf(tech)]] : []),
        ...(filters.q ? [[t("Search"), filters.q]] : []),
      ],
      summary: [
        [t("OrdersCount"), String(rows.length)],
        [t("Pieces"), String(sum("pieces"))],
      ],
      columns: [
        { title: t("OrderNo"), key: "no", type: "text", width: 14 },
        { title: t("OrderDate"), key: "date", type: "text", width: 12 },
        { title: t("Customer"), key: "customer", type: "text", width: 22 },
        { title: t("Phone"), key: "phone", type: "text", width: 13 },
        { title: t("Persons"), key: "persons", type: "text", width: 22 },
        { title: t("Pieces"), key: "pieces", type: "number", width: 8 },
        { title: t("DeliveryDate"), key: "delivery", type: "text", width: 12 },
        { title: t("Tailor"), key: "tailor", type: "text", width: 14 },
        { title: t("Status"), key: "status", type: "text", width: 12 },
        { title: t("Total"), key: "total", type: "money" },
        { title: t("Paid"), key: "paid", type: "money" },
        { title: t("Due"), key: "due", type: "money" },
      ],
      rows: rows.map((r) => ({
        key: r.id,
        no: r.docNo,
        date: formatDate(r.orderDate),
        customer: nameOf(r.customer),
        phone: r.customer.phone ?? "",
        persons: r.persons.join("، "),
        pieces: r.pieces,
        delivery: formatDay(r.deliveryDate),
        tailor: r.technician ? nameOf(r.technician) : "",
        status: t(`st_${r.status}`) + (r.late ? ` (${t("st_late")})` : ""),
        total: r.total,
        paid: r.paid,
        due: r.due,
      })),
      totals: {
        pieces: sum("pieces"),
        total: sum("total"),
        paid: sum("paid"),
        due: sum("due"),
      },
    };
  };

  const counts = data.counts ?? {};
  // بحث / فلتر من غير نتايج ← رسالة واضحة
  const searched = Boolean(
    filters.q || filters.from || filters.to || filters.technicianId,
  );
  const noResults = searched && data.total === 0;
  useEffect(() => {
    if (noResults) message.info(t("NoOrdersFound"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageHeader
        title={t("OrdersTitle")}
        extra={
          <Space wrap>
            <ExportButtons
              build={buildExport}
              loadAll={loadAll}
              disabled={!data.total}
            />
            {canCreate ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => router.push("/tailoring/new")}
              >
                {t("NewOrder")}
              </Button>
            ) : null}
          </Space>
        }
      />
      <Card size="small" className="mb-3">
        <div className="cp-filters">
          <Space wrap align="end" size={[8, 8]}>
            <SearchBox
              width={300}
              placeholder={t("SearchOrders")}
              value={f.q}
              onChange={(v) => {
                setF((x) => ({ ...x, q: v }));
                if (!v && filters.q) go({ q: "" });
              }}
              onSearch={(v) => go({ q: v.trim() })}
            />
            <Select
              style={{ width: 150 }}
              value={f.dateBy}
              onChange={(v) => setF((x) => ({ ...x, dateBy: v }))}
              options={[
                { value: "order", label: t("ByOrderDate") },
                { value: "delivery", label: t("ByDeliveryDate") },
              ]}
            />
            <DayPicker
              allowClear
              style={{ width: 140 }}
              placeholder={t("From")}
              value={f.from}
              max={f.to}
              onChange={(v) => setF((x) => ({ ...x, from: v ?? null }))}
            />
            <DayPicker
              allowClear
              style={{ width: 140 }}
              placeholder={t("To")}
              value={f.to}
              min={f.from}
              onChange={(v) => setF((x) => ({ ...x, to: v ?? null }))}
            />
            <Select
              allowClear
              style={{ width: 170 }}
              placeholder={t("AllTailors")}
              value={f.technicianId ?? undefined}
              onChange={(v) => setF((x) => ({ ...x, technicianId: v ?? null }))}
              options={technicians.map((x) => ({
                value: x.id,
                label: nameOf(x),
              }))}
            />
            <Button type="primary" onClick={() => go({})}>
              {t("Show")}
            </Button>
          </Space>
        </div>
      </Card>

      <div className="mb-3" style={{ overflowX: "auto" }}>
        <Segmented
          value={f.status}
          onChange={(v) => go({ status: v })}
          options={STATUS_TABS.map((s) => ({
            value: s,
            label: (
              <Space size={4}>
                {t(`st_${s}`)}
                <Badge
                  count={counts[s] ?? 0}
                  showZero
                  overflowCount={9999}
                  color={s === "late" && counts.late ? C.danger : C.subtle}
                />
              </Space>
            ),
          }))}
        />
      </div>

      {noResults && (
        <Alert
          type="info"
          showIcon
          className="mb-3"
          title={
            filters.q ? t("NoOrdersForQ", { q: filters.q }) : t("NoOrdersFound")
          }
          description={t("NoOrdersHint")}
        />
      )}

      {canUpdate && picked.length > 0 && (
        <Space wrap className="mb-3">
          <span>{t("SelectedN", { n: picked.length })}</span>
          {["working", "ready"].map((s) => (
            <Button key={s} loading={busy} onClick={() => setStatus(s)}>
              {t(`to_${s}`)}
            </Button>
          ))}
        </Space>
      )}

      <Table
        bordered
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={data.rows}
        tableLayout="fixed"
        scroll={{ x: columns.reduce((s, c) => s + c.width, 0) + 50 }}
        rowSelection={
          canUpdate
            ? {
                selectedRowKeys: picked,
                onChange: setPicked,
                getCheckboxProps: (r) => ({
                  disabled: !["new", "working", "ready"].includes(r.status),
                }),
              }
            : undefined
        }
        pagination={{
          current: data.page,
          pageSize: data.pageSize,
          total: data.total,
          showSizeChanger: false,
          onChange: (page) => go({ page }),
        }}
        locale={{ emptyText: t("NoOrders") }}
      />
      {payFor && (
        <PayDueModal
          order={payFor}
          paymentMethods={paymentMethods}
          onClose={() => setPayFor(null)}
        />
      )}
    </div>
  );
}

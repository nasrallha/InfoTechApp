"use client";

import { useStaffT } from "./useStaffT";
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import {
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import StatusFilters from "@/components/common/StatusFilters";
import DayPicker from "@/components/common/DayPicker";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCan, useModule } from "@/components/auth/AuthProvider";
import { Link } from "@/i18n/routing";
import { formatDate, formatDateTime, today } from "@/lib/dates";
import { formatDocNo, saleDocNo } from "@/lib/doc-number";
import {
  listJobsAction,
  updateSaleJobAction,
  updateVisitAction,
} from "@/actions/technician.actions";
import { C } from "@/lib/theme";

const plusDays = (n) => dayjs().add(n, "day").format("YYYY-MM-DD");
// لون كل حالة (الفلاتر، الصفوف، العلامة)
export const JOB_COLORS = {
  pending: C.info,
  overdue: C.warning,
  done: C.success,
  cancelled: C.muted,
  all: C.purple,
};
const JOB_FILTERS = ["pending", "overdue", "done", "cancelled", "all"];
const matches = (r, f) =>
  f === "all" ? true : f === "overdue" ? r.overdue : r.status === f;

// ============================================================
// المواعيد: تركيبات وخدمات الفواتير + زيارات عقود الصيانة
// (متأخر بالأحمر)، وتحديث الحالة: اتنفذ / تأجيل / إلغاء
// ============================================================
export default function JobsView({ technicians = [] }) {
  const t = useStaffT();
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const can = useCan();
  const techOn = useModule("technicians");
  const contractsOn = useModule("maintenanceContracts");
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [filters, setFilters] = useState({
    from: today(),
    to: plusDays(7),
    technicianId: undefined,
    type: "all",
  });
  const [status, setStatus] = useState("pending");
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState({ key: null, rows: [] });
  const [postpone, setPostpone] = useState(null);
  const key = JSON.stringify({ ...filters, tick });

  const load = useCallback(() => listJobsAction(filters), [filters]);
  useEffect(() => {
    let alive = true;
    load().then((res) => {
      if (!alive) return;
      if (!res.success) showActionError(res, tAlerts, locale);
      setResult((prev) => ({ key, rows: res.success ? res.data : prev.rows }));
    });
    return () => {
      alive = false;
    };
  }, [load, key, tAlerts, locale]);

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const canRow = (r) =>
    r.type === "sale"
      ? can("technicians.jobs")
      : can("maintenanceContracts.visits");

  const update = async (r, patch) => {
    const res =
      r.type === "sale"
        ? await updateSaleJobAction({ id: r.id, ...patch })
        : await updateVisitAction({
            id: r.id,
            ...(patch.status
              ? {
                  status:
                    patch.status === "cancelled" ? "skipped" : patch.status,
                }
              : {}),
            ...(patch.at
              ? { dueDate: dayjs(patch.at).format("YYYY-MM-DD") }
              : {}),
          });
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("JobUpdated"));
    setPostpone(null);
    setTick((x) => x + 1);
  };

  return (
    <>
      <PageHeader title={t("JobsTitle")} subtitle={t("JobsSubtitle")} />
      <Card size="small" className="mb-3">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={12} md={4}>
            <DayPicker
              value={filters.from}
              onChange={(v) => set({ from: v })}
              allowClear
            />
          </Col>
          <Col xs={12} md={4}>
            <DayPicker
              value={filters.to}
              onChange={(v) => set({ to: v })}
              allowClear
            />
          </Col>
          <Col xs={24} md={5}>
            <Select
              allowClear
              showSearch
              style={{ width: "100%" }}
              placeholder={t("AllTechnicians")}
              optionFilterProp="label"
              value={filters.technicianId}
              onChange={(v) => set({ technicianId: v ?? undefined })}
              options={technicians.map((x) => ({ value: x.id, label: nm(x) }))}
            />
          </Col>
          {techOn && contractsOn && (
            <Col xs={24} md={7}>
              <Segmented
                block
                value={filters.type}
                onChange={(v) => set({ type: v })}
                options={["all", "sale", "visit"].map((s) => ({
                  value: s,
                  label: t(`JobType_${s}`),
                }))}
              />
            </Col>
          )}
        </Row>
        <StatusFilters
          className="mt-3"
          value={status}
          onChange={setStatus}
          options={JOB_FILTERS.map((s) => ({
            value: s,
            label: t(`JobFilter_${s}`),
            color: JOB_COLORS[s],
            count: result.rows.filter((r) => matches(r, s)).length,
          }))}
        />
      </Card>

      <Table
        className="sc-table"
        size="small"
        rowKey="key"
        rowClassName={() => "sc-row"}
        onRow={(r) => ({
          style: {
            "--c": r.overdue ? JOB_COLORS.overdue : JOB_COLORS[r.status],
          },
        })}
        loading={result.key !== key}
        dataSource={result.rows.filter((r) => matches(r, status))}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        scroll={{ x: 1150 }}
        columns={[
          {
            title: t("When"),
            width: 150,
            render: (_, r) => (
              <span style={{ color: r.overdue ? C.dangerText : undefined }}>
                {r.overdue && <ClockCircleOutlined />}{" "}
                <bdi>
                  {!r.at
                    ? t("NoDate")
                    : r.type === "visit"
                      ? formatDate(r.at)
                      : formatDateTime(r.at)}
                </bdi>
                {r.overdue && (
                  <div style={{ fontSize: 12 }}>{t("Overdue")}</div>
                )}
              </span>
            ),
          },
          {
            title: t("Type"),
            width: 110,
            render: (_, r) => (
              <Tag color={r.type === "sale" ? "purple" : "cyan"}>
                {t(`JobType_${r.type}`)}
              </Tag>
            ),
          },
          {
            title: t("Job"),
            width: 200,
            render: (_, r) => (
              <span>
                <b>{nm(r.title)}</b>
                {r.note && (
                  <div style={{ color: C.muted, fontSize: 12 }}>{r.note}</div>
                )}
              </span>
            ),
          },
          {
            title: t("Customer"),
            width: 190,
            render: (_, r) => (
              <span>
                {nm(r.customer) || "—"}
                {r.phone && (
                  <div style={{ color: C.muted, fontSize: 12 }}>
                    <bdi>{r.phone}</bdi>
                  </div>
                )}
              </span>
            ),
          },
          {
            title: t("Address"),
            width: 180,
            render: (_, r) => r.address || "—",
          },
          {
            title: t("Technician"),
            width: 130,
            render: (_, r) => nm(r.technician) || "—",
          },
          {
            title: t("Ref"),
            width: 90,
            render: (_, r) =>
              r.ref.kind === "sale" ? (
                <Link href={`/invoices/sales/${r.ref.id}`}>
                  <bdi>{saleDocNo("sale", r.ref.number, r.ref.docCode)}</bdi>
                </Link>
              ) : (
                <Link href={`/maintenance-contracts/${r.ref.id}`}>
                  <bdi>{formatDocNo("contract", r.ref.number, r.ref.docCode)}</bdi>
                </Link>
              ),
          },
          {
            title: t("Status"),
            width: 100,
            render: (_, r) => (
              <Tag color={JOB_COLORS[r.status]}>
                {t(`JobStatus_${r.status}`)}
              </Tag>
            ),
          },
          {
            title: "",
            width: 120,
            render: (_, r) =>
              canRow(r) && r.status === "pending" ? (
                <Space size={4}>
                  <Popconfirm
                    title={t("ConfirmDone")}
                    onConfirm={() => update(r, { status: "done" })}
                  >
                    <Button
                      size="small"
                      type="primary"
                      icon={<CheckOutlined />}
                      title={t("MarkDone")}
                    />
                  </Popconfirm>
                  <Button
                    size="small"
                    icon={<ClockCircleOutlined />}
                    title={t("Postpone")}
                    onClick={() => setPostpone(r)}
                  />
                  <Popconfirm
                    title={t("ConfirmCancel")}
                    onConfirm={() => update(r, { status: "cancelled" })}
                  >
                    <Button
                      size="small"
                      danger
                      icon={<CloseOutlined />}
                      title={t("CancelJob")}
                    />
                  </Popconfirm>
                </Space>
              ) : null,
          },
        ]}
      />

      {postpone && (
        <PostponeModal
          row={postpone}
          onClose={() => setPostpone(null)}
          onSave={(at) => update(postpone, { at })}
        />
      )}
    </>
  );
}

function PostponeModal({ row, onClose, onSave }) {
  const t = useStaffT();
  const visit = row.type === "visit";
  const [value, setValue] = useState(row.at ? dayjs(row.at) : dayjs());
  return (
    <Modal
      open
      title={t("Postpone")}
      onCancel={onClose}
      onOk={() => value && onSave(value.toISOString())}
      destroyOnHidden
    >
      <DatePicker
        style={{ width: "100%" }}
        value={value}
        onChange={setValue}
        showTime={visit ? false : { format: "HH:mm" }}
        format={visit ? "DD/MM/YYYY" : "DD/MM/YYYY HH:mm"}
      />
    </Modal>
  );
}

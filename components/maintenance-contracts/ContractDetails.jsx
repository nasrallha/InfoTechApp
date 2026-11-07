"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Descriptions,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import {
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  EditOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import "@/components/common/status-colors.css";
import DayPicker from "@/components/common/DayPicker";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCan } from "@/components/auth/AuthProvider";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { formatDateTime, today } from "@/lib/dates";
import { formatDocNo } from "@/lib/doc-number";
import {
  cancelContractAction,
  updateVisitAction,
} from "@/actions/technician.actions";
import ContractFormModal from "./ContractFormModal";
import { CONTRACT_COLORS } from "./ContractsView";
import { C } from "@/lib/theme";

// لون الزيارة (العلامة وخلفية الصف)، والمتأخرة برتقالي غامق
const VISIT_COLORS = {
  pending: C.info,
  late: C.warning,
  done: C.success,
  skipped: C.muted,
};
const visitColor = (v, todayDay) =>
  v.status === "pending" && v.dueDate < todayDay
    ? VISIT_COLORS.late
    : VISIT_COLORS[v.status];

// ============================================================
// تفاصيل عقد الصيانة: البيانات + جدول الزيارات (تنفيذ / تأجيل / إلغاء)
// ============================================================
export default function ContractDetails({ contract: c, technicians = [] }) {
  const t = useTranslations("Contracts");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const can = useCan();
  const { amount: money } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [editing, setEditing] = useState(false);
  const [doing, setDoing] = useState(null); // { visit, mode: done | postpone }
  const todayDay = today();
  const canVisits =
    can("maintenanceContracts.visits") && c.status !== "cancelled";

  const cancel = async () => {
    const res = await cancelContractAction(c.id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Cancelled"));
  };

  const updateVisit = async (payload) => {
    const res = await updateVisitAction(payload);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("VisitUpdated"));
    setDoing(null);
  };

  const done = c.visits.filter((v) => v.status === "done").length;
  const late = c.visits.filter(
    (v) => v.status === "pending" && v.dueDate < todayDay,
  ).length;
  const next = c.visits.find(
    (v) => v.status === "pending" && v.dueDate >= todayDay,
  );

  return (
    <>
      <PageHeader
        title={
          <Space wrap>
            <span>
              {t("Contract")} <bdi>{formatDocNo("contract", c.number)}</bdi>
            </span>
            <Tag color={CONTRACT_COLORS[c.status]}>
              {t(`Status_${c.status}`)}
            </Tag>
          </Space>
        }
        extra={
          c.status !== "cancelled" && (
            <Space wrap>
              {can("maintenanceContracts.update") && (
                <Button
                  icon={<EditOutlined />}
                  onClick={() => setEditing(true)}
                >
                  {t("Edit")}
                </Button>
              )}
              {can("maintenanceContracts.cancel") && (
                <Popconfirm title={t("ConfirmCancel")} onConfirm={cancel}>
                  <Button danger icon={<StopOutlined />}>
                    {t("Cancel")}
                  </Button>
                </Popconfirm>
              )}
            </Space>
          )
        }
      />

      {/* شريط ملوّن بحالة العقد: نسبة الزيارات المنفذة + المتأخر + الجاية */}
      <div
        className="sc-hero mb-3"
        style={{ "--c": CONTRACT_COLORS[c.status] }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 24,
            alignItems: "center",
          }}
        >
          <Progress
            type="circle"
            size={64}
            strokeColor={CONTRACT_COLORS[c.status]}
            percent={
              c.visits.length ? Math.round((done / c.visits.length) * 100) : 0
            }
          />
          <div>
            <div style={{ color: C.muted }}>{t("VisitsDone")}</div>
            <b style={{ fontSize: 20 }}>
              {done} / {c.visits.length}
            </b>
          </div>
          {late > 0 && (
            <Tag color={VISIT_COLORS.late} style={{ fontSize: 14 }}>
              <ClockCircleOutlined /> {t("LateVisits", { n: late })}
            </Tag>
          )}
          {next && c.status === "active" && (
            <div>
              <div style={{ color: C.muted }}>{t("NextVisit")}</div>
              <b style={{ fontSize: 16, color: VISIT_COLORS.pending }}>
                <bdi>{next.dueDate}</bdi>
              </b>
            </div>
          )}
        </div>
      </div>

      <Card size="small" className="mb-3">
        <Descriptions
          size="small"
          bordered
          column={{ xs: 1, sm: 2, lg: 3 }}
          items={[
            {
              key: "c",
              label: t("Customer"),
              children: (
                <span>
                  {nm(c.customer)}
                  {c.customer?.phone && (
                    <>
                      {" "}
                      — <bdi>{c.customer.phone}</bdi>
                    </>
                  )}
                </span>
              ),
            },
            { key: "d", label: t("Device"), children: <b>{c.deviceName}</b> },
            {
              key: "s",
              label: t("Serial"),
              children: c.serialText ? <bdi>{c.serialText}</bdi> : "—",
            },
            { key: "a", label: t("Address"), children: c.address || "—" },
            {
              key: "e",
              label: t("Every"),
              children: t("EveryN", { n: c.intervalMonths }),
            },
            {
              key: "p",
              label: t("Period"),
              children: (
                <bdi>
                  {c.startDate} — {c.endDate}
                </bdi>
              ),
            },
            {
              key: "t",
              label: t("Technician"),
              children: nm(c.technician) || "—",
            },
            {
              key: "m",
              label: t("Amount"),
              children: c.amount != null ? money(c.amount) : "—",
            },
            {
              key: "v",
              label: t("VisitsDone"),
              children: `${done} / ${c.visits.length}`,
            },
            ...(c.notes
              ? [{ key: "n", label: t("Notes"), children: c.notes }]
              : []),
          ]}
        />
      </Card>

      <Card size="small" title={t("Visits")}>
        <Table
          className="sc-table"
          size="small"
          rowKey="id"
          rowClassName={() => "sc-row"}
          onRow={(v) => ({ style: { "--c": visitColor(v, todayDay) } })}
          pagination={false}
          dataSource={c.visits}
          scroll={{ x: 760 }}
          columns={[
            { title: "#", width: 50, render: (_, __, i) => i + 1 },
            {
              title: t("DueDate"),
              width: 140,
              render: (_, v) => {
                const late = v.status === "pending" && v.dueDate < todayDay;
                return (
                  <span style={{ color: late ? C.dangerText : undefined }}>
                    {late && <ClockCircleOutlined />} <bdi>{v.dueDate}</bdi>
                  </span>
                );
              },
            },
            {
              title: t("Status"),
              width: 110,
              render: (_, v) => (
                <Tag color={visitColor(v, todayDay)}>
                  {t(`Visit_${v.status}`)}
                </Tag>
              ),
            },
            {
              title: t("Technician"),
              width: 130,
              render: (_, v) => nm(v.technician ?? c.technician) || "—",
            },
            {
              title: t("DoneAt"),
              width: 150,
              render: (_, v) =>
                v.doneAt ? <bdi>{formatDateTime(v.doneAt)}</bdi> : "—",
            },
            { title: t("Note"), render: (_, v) => v.note || "—" },
            {
              title: "",
              width: 120,
              render: (_, v) =>
                canVisits && v.status === "pending" ? (
                  <Space size={4}>
                    <Button
                      size="small"
                      type="primary"
                      icon={<CheckOutlined />}
                      title={t("MarkDone")}
                      onClick={() => setDoing({ visit: v, mode: "done" })}
                    />
                    <Button
                      size="small"
                      icon={<ClockCircleOutlined />}
                      title={t("Postpone")}
                      onClick={() => setDoing({ visit: v, mode: "postpone" })}
                    />
                    <Popconfirm
                      title={t("ConfirmSkip")}
                      onConfirm={() =>
                        updateVisit({ id: v.id, status: "skipped" })
                      }
                    >
                      <Button
                        size="small"
                        danger
                        icon={<CloseOutlined />}
                        title={t("Skip")}
                      />
                    </Popconfirm>
                  </Space>
                ) : null,
            },
          ]}
        />
      </Card>

      {doing && (
        <VisitModal
          visit={doing.visit}
          mode={doing.mode}
          technicians={technicians}
          defaultTechnicianId={c.technician?.id}
          onClose={() => setDoing(null)}
          onSave={updateVisit}
        />
      )}
      {editing && (
        <ContractFormModal
          contract={c}
          technicians={technicians}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

// تنفيذ الزيارة (الفني + ملاحظة) أو تأجيلها لتاريخ تاني
function VisitModal({
  visit,
  mode,
  technicians,
  defaultTechnicianId,
  onClose,
  onSave,
}) {
  const t = useTranslations("Contracts");
  const locale = useLocale();
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  const [technicianId, setTechnicianId] = useState(
    visit.technician?.id ?? defaultTechnicianId,
  );
  const [note, setNote] = useState(visit.note ?? "");
  const [dueDate, setDueDate] = useState(visit.dueDate);

  return (
    <Modal
      open
      title={mode === "done" ? t("MarkDone") : t("Postpone")}
      onCancel={onClose}
      onOk={() =>
        onSave(
          mode === "done"
            ? {
                id: visit.id,
                status: "done",
                technicianId: technicianId ?? null,
                note: note.trim() || null,
              }
            : { id: visit.id, dueDate },
        )
      }
      destroyOnHidden
    >
      {mode === "done" ? (
        <div style={{ display: "grid", gap: 8 }}>
          <Select
            allowClear
            showSearch
            style={{ width: "100%" }}
            placeholder={t("Technician")}
            optionFilterProp="label"
            value={technicianId}
            onChange={setTechnicianId}
            options={technicians.map((x) => ({ value: x.id, label: nm(x) }))}
          />
          <Input.TextArea
            rows={3}
            maxLength={500}
            placeholder={t("VisitNotePlaceholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      ) : (
        <DayPicker value={dueDate} onChange={setDueDate} />
      )}
    </Modal>
  );
}

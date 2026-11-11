"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Drawer,
  Dropdown,
  Input,
  Modal,
  Space,
  Table,
  Tag,
} from "antd";
import {
  BarChartOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  EditOutlined,
  EnvironmentOutlined,
  FileAddOutlined,
  HistoryOutlined,
  MoreOutlined,
  PauseCircleOutlined,
  PhoneOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import StatusFilters from "@/components/common/StatusFilters";
import DayPicker from "@/components/common/DayPicker";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCan } from "@/components/auth/AuthProvider";
import { Link } from "@/i18n/routing";
import { formatDateTime, formatDay, today } from "@/lib/dates";
import { saleDocNo } from "@/lib/doc-number";
import {
  followUpLogsAction,
  listFollowUpsAction,
  markFollowUpDoneAction,
  postponeFollowUpAction,
  setFollowUpStatusAction,
  updateFollowUpAction,
} from "@/actions/follow-up.actions";
import { FollowUpModal } from "./LineFollowUp";
import { C } from "@/lib/theme";
import "@/components/common/status-colors.css";

// لون كل مستوى (الفلاتر، الصفوف)
export const FOLLOWUP_COLORS = {
  due: C.info,
  overdue: C.danger,
  today: C.warning,
  soon: C.info,
  later: C.success,
  all: C.purple,
  stopped: C.muted,
};
const FILTERS = ["due", "overdue", "today", "soon", "later", "all", "stopped"];

// ============================================================
// المتابعات الدورية: مين ميعاده جه أو قرب
// تمت / فاتورة صيانة / تأجيل / تعديل / إيقاف / السجل / اللوكيشن
// ============================================================
export default function FollowUpsView({ focusId = null }) {
  const t = useTranslations("FollowUps");
  const tButtons = useTranslations("Buttons");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const can = useCan();
  const canUpdate = can("followUps.update");
  const canInvoice = can("sales.create");
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [filter, setFilter] = useState(focusId ? "all" : "due");
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState({ key: null, rows: [], counts: {} });
  const [dialog, setDialog] = useState(null); // { type, row }
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify({ filter, q, tick });

  const load = useCallback(
    () => listFollowUpsAction({ filter, q }),
    [filter, q],
  );
  useEffect(() => {
    let alive = true;
    load().then((res) => {
      if (!alive) return;
      if (!res.success) showActionError(res, tAlerts, locale);
      setResult((prev) =>
        res.success ? { key, ...res.data } : { ...prev, key },
      );
    });
    return () => {
      alive = false;
    };
  }, [load, key, tAlerts, locale]);

  const run = async (action, payload, okMsg) => {
    setBusy(true);
    const res = await action(payload);
    setBusy(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(okMsg);
    setDialog(null);
    setTick((x) => x + 1);
  };

  const whenText = (r) =>
    r.status === "stopped"
      ? t("Stopped")
      : r.days < 0
        ? t("LateBy", { days: -r.days })
        : r.days === 0
          ? t("Today")
          : t("InDays", { days: r.days });

  const actionsMenu = (r) => ({
    items: [
      {
        key: "history",
        icon: <HistoryOutlined />,
        label: t("History"),
        onClick: () => setDialog({ type: "history", row: r }),
      },
      ...(canUpdate
        ? [
            {
              key: "edit",
              icon: <EditOutlined />,
              label: t("Edit"),
              onClick: () => setDialog({ type: "edit", row: r }),
            },
            r.status === "active"
              ? {
                  key: "stop",
                  icon: <PauseCircleOutlined />,
                  danger: true,
                  label: t("Stop"),
                  onClick: () => setDialog({ type: "stop", row: r }),
                }
              : {
                  key: "resume",
                  icon: <PlayCircleOutlined />,
                  label: t("Resume"),
                  onClick: () =>
                    run(
                      setFollowUpStatusAction,
                      { id: r.id, active: true },
                      t("Resumed"),
                    ),
                },
          ]
        : []),
    ],
  });

  const columns = [
    {
      title: t("Customer"),
      key: "customer",
      width: 190,
      render: (_, r) => (
        <div>
          <b>{nm(r.customer)}</b>
          {(r.phone || r.customer?.phone) && (
            <div style={{ fontSize: 12 }}>
              <a href={`tel:${r.phone || r.customer.phone}`}>
                <PhoneOutlined /> <bdi>{r.phone || r.customer.phone}</bdi>
              </a>
            </div>
          )}
        </div>
      ),
    },
    {
      title: t("Device"),
      key: "device",
      width: 190,
      render: (_, r) => (
        <div>
          <b>{r.deviceName}</b>
          {r.place && <Tag className="ms-1">{r.place}</Tag>}
          <div style={{ fontSize: 12, color: C.muted }}>
            {t("EveryNDays", { n: r.intervalDays })}
            {r.originSale && (
              <>
                {" · "}
                <Link href={`/invoices/sales/${r.originSale.id}`}>
                  <bdi>{saleDocNo("sale", r.originSale.number, r.originSale.docCode)}</bdi>
                </Link>
              </>
            )}
          </div>
        </div>
      ),
    },
    {
      title: t("Address"),
      key: "address",
      width: 200,
      render: (_, r) => (
        <div>
          {r.address || "—"}
          {r.locationUrl && (
            <div>
              <a href={r.locationUrl} target="_blank" rel="noopener noreferrer">
                <EnvironmentOutlined /> {t("OpenMap")}
              </a>
            </div>
          )}
        </div>
      ),
    },
    {
      title: t("LastDate"),
      key: "last",
      width: 105,
      render: (_, r) => <bdi>{formatDay(r.lastDate)}</bdi>,
    },
    // عدد مرات الصيانة (السجل فيه التفاصيل)
    {
      title: t("ServiceCount"),
      key: "count",
      width: 90,
      align: "center",
      render: (_, r) => (
        <Tag
          color={r.serviceCount ? "green" : "default"}
          style={{ cursor: "pointer" }}
          onClick={() => setDialog({ type: "history", row: r })}
        >
          {r.serviceCount}
        </Tag>
      ),
    },
    {
      title: t("NextDate"),
      key: "next",
      width: 140,
      render: (_, r) => (
        <div style={{ color: FOLLOWUP_COLORS[r.level], fontWeight: 700 }}>
          <bdi>{formatDay(r.nextDate)}</bdi>
          <div style={{ fontSize: 12 }}>
            {r.days < 0 && r.status === "active" && <ClockCircleOutlined />}{" "}
            {whenText(r)}
          </div>
        </div>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 230,
      render: (_, r) => (
        <Space size={4} wrap>
          {r.status === "active" && canInvoice && (
            <Link href={`/invoices/sales/new?followUp=${r.id}`}>
              <Button size="small" type="primary" icon={<FileAddOutlined />}>
                {t("Invoice")}
              </Button>
            </Link>
          )}
          {r.status === "active" && canUpdate && (
            <>
              <Button
                size="small"
                icon={<CheckOutlined />}
                title={t("Done")}
                onClick={() => setDialog({ type: "done", row: r })}
              />
              <Button
                size="small"
                icon={<ClockCircleOutlined />}
                title={t("Postpone")}
                onClick={() => setDialog({ type: "postpone", row: r })}
              />
            </>
          )}
          <Dropdown menu={actionsMenu(r)} trigger={["click"]}>
            <Button aria-label={tButtons("More")} title={tButtons("More")} size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("Title")}
        subtitle={t("Subtitle")}
        extra={
          <Link href="/follow-ups/report">
            <Button icon={<BarChartOutlined />}>{t("ReportTitle")}</Button>
          </Link>
        }
      />
      <Card size="small" className="mb-3">
        <StatusFilters
          className="mb-3"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({
            value: f,
            label: t(`Filter_${f}`),
            color: FOLLOWUP_COLORS[f],
            count: f === "stopped" ? undefined : (result.counts?.[f] ?? 0),
          }))}
        />
        <Input.Search
          allowClear
          style={{ maxWidth: 420 }}
          placeholder={t("SearchPlaceholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onSearch={(v) => setQ(v.trim())}
        />
      </Card>

      <Table
        className="sc-table"
        size="small"
        rowKey="id"
        rowClassName={() => "sc-row"}
        onRow={(r) => ({
          style: {
            "--c": FOLLOWUP_COLORS[r.level],
            ...(r.id === focusId ? { outline: `2px solid ${C.primary}` } : {}),
          },
        })}
        loading={result.key !== key}
        dataSource={result.rows}
        scroll={{ x: 1150 }}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        columns={columns}
      />

      {dialog?.type === "done" && (
        <NoteDateModal
          title={`${t("Done")} — ${dialog.row.deviceName}`}
          hint={t("DoneHint", { n: dialog.row.intervalDays })}
          dateLabel={t("DoneDate")}
          initialDate={today()}
          maxDate={today()}
          busy={busy}
          onClose={() => setDialog(null)}
          onSave={(v) =>
            run(markFollowUpDoneAction, { id: dialog.row.id, ...v }, t("Saved"))
          }
        />
      )}
      {dialog?.type === "postpone" && (
        <NoteDateModal
          title={`${t("Postpone")} — ${dialog.row.deviceName}`}
          dateLabel={t("NewDate")}
          initialDate={dialog.row.nextDate}
          busy={busy}
          onClose={() => setDialog(null)}
          onSave={(v) =>
            run(
              postponeFollowUpAction,
              { id: dialog.row.id, ...v },
              t("Postponed"),
            )
          }
        />
      )}
      {dialog?.type === "stop" && (
        <NoteDateModal
          title={`${t("Stop")} — ${dialog.row.deviceName}`}
          hint={t("StopHint")}
          busy={busy}
          onClose={() => setDialog(null)}
          onSave={(v) =>
            run(
              setFollowUpStatusAction,
              { id: dialog.row.id, active: false, note: v.note },
              t("StoppedMsg"),
            )
          }
        />
      )}
      {dialog?.type === "edit" && (
        <FollowUpModal
          title={`${t("Edit")} — ${dialog.row.deviceName}`}
          value={dialog.row}
          allowRemove={false}
          saving={busy}
          onClose={() => setDialog(null)}
          onSave={(v) =>
            run(updateFollowUpAction, { ...v, id: dialog.row.id }, t("Saved"))
          }
        />
      )}
      {dialog?.type === "history" && (
        <HistoryDrawer row={dialog.row} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

// تاريخ + ملاحظة (تمت / تأجيل / إيقاف)
function NoteDateModal({
  title,
  hint,
  dateLabel,
  initialDate,
  maxDate,
  busy,
  onClose,
  onSave,
}) {
  const t = useTranslations("FollowUps");
  const [date, setDate] = useState(initialDate);
  const [note, setNote] = useState("");
  return (
    <Modal
      open
      title={title}
      onCancel={onClose}
      confirmLoading={busy}
      okButtonProps={{ disabled: Boolean(dateLabel) && !date }}
      onOk={() =>
        onSave({
          ...(dateLabel ? { date } : {}),
          note: note.trim() || null,
        })
      }
      destroyOnHidden
    >
      {hint && <div style={{ color: C.muted, marginBottom: 12 }}>{hint}</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {dateLabel && (
          <div>
            <div className="mb-1">{dateLabel}</div>
            <DayPicker value={date} onChange={setDate} max={maxDate} />
          </div>
        )}
        <Input.TextArea
          rows={3}
          maxLength={500}
          placeholder={t("NotePlaceholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}

const LOG_COLORS = {
  created: C.info,
  invoice: C.success,
  service: C.successText,
  done: C.success,
  postponed: C.warning,
  stopped: C.danger,
  resumed: C.accent,
  edited: C.muted,
};

// سجل المتابعة
function HistoryDrawer({ row, onClose }) {
  const t = useTranslations("FollowUps");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const [logs, setLogs] = useState(null);
  useEffect(() => {
    let alive = true;
    followUpLogsAction(row.id).then((res) => {
      if (!alive) return;
      if (!res.success) showActionError(res, tAlerts, locale);
      setLogs(res.success ? res.data : []);
    });
    return () => {
      alive = false;
    };
  }, [row.id, tAlerts, locale]);
  const userName = (u) =>
    u ? (locale === "ar" ? u.arFullname : u.enFullname) : "";
  return (
    <Drawer
      open
      size={460}
      title={`${t("History")} — ${row.deviceName}`}
      onClose={onClose}
    >
      {logs === null ? null : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {logs.map((l) => (
            <li
              key={l.id}
              style={{
                borderInlineStart: `3px solid ${LOG_COLORS[l.type]}`,
                padding: "6px 12px",
                marginBottom: 10,
                background: C.bgSubtle,
                borderRadius: 6,
              }}
            >
              <b>{t(`Log_${l.type}`)}</b>
              {l.sale && (
                <>
                  {" "}
                  <Link
                    href={`/invoices/${l.sale.type === "return" ? "sales-returns" : "sales"}/${l.sale.id}`}
                  >
                    <bdi>{saleDocNo(l.sale.type, l.sale.number, l.sale.docCode)}</bdi>
                  </Link>
                </>
              )}
              <div style={{ fontSize: 12, color: C.muted }}>
                <bdi>{formatDateTime(l.date)}</bdi> — {userName(l.user)}
              </div>
              {l.nextDate && (
                <div style={{ fontSize: 12 }}>
                  {t("NextDate")}: <bdi>{formatDay(l.nextDate)}</bdi>
                </div>
              )}
              {l.note && <div>{l.note}</div>}
            </li>
          ))}
        </ol>
      )}
    </Drawer>
  );
}

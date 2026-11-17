"use client";

import { useState } from "react";
import { Alert, Button, Card, Modal, Popconfirm, Select, Space, Table, Tag, Tooltip } from "antd";
import { EditOutlined, LockOutlined, QuestionCircleOutlined, UnlockOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import DayPicker from "@/components/common/DayPicker";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import {
  setFiscalStartMonthAction,
  setFiscalYearStatusAction,
  updateFiscalYearAction,
} from "@/actions/fiscal-year.actions";
import { formatDay } from "@/lib/dates";

// ============================================================
// السنوات المالية (الإدارة)
// - كل سنة: الرمز (بيظهر في رقم المستند DM-SI-2026-15) والفترة والحالة
// - الإقفال / الفتح: fiscalYears.close (مدير النظام) - المقفلة: مفيش مستندات جديدة ولا تعديل فيها
// - تعديل التواريخ وبداية السنة المالية: fiscalYears.manage (المالك)
// - السنة بتتعمل أوتوماتيك مع أول مستند بتاريخ فيها
// ============================================================
export default function FiscalYearsView({ data, perms }) {
  const t = useTranslations("FiscalYears");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const [edit, setEdit] = useState(null); // { id, code, startDate, endDate }
  const [saving, setSaving] = useState(false);

  const run = async (action, input, okText) => {
    const res = await action(input);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(okText);
  };

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2026, i, 1).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", { month: "long" }),
  }));

  const saveEdit = async () => {
    setSaving(true);
    const res = await updateFiscalYearAction({ id: edit.id, startDate: edit.startDate, endDate: edit.endDate });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Saved"));
    setEdit(null);
  };

  const columns = [
    {
      title: t("Year"),
      dataIndex: "code",
      width: 120,
      render: (v, y) => (
        <span>
          <b>{v}</b> {y.current && <Tag color="blue">{t("Current")}</Tag>}
        </span>
      ),
    },
    { title: t("From"), dataIndex: "startDate", width: 130, render: (v) => formatDay(v) },
    { title: t("To"), dataIndex: "endDate", width: 130, render: (v) => formatDay(v) },
    {
      title: t("Status"),
      dataIndex: "status",
      width: 120,
      align: "center",
      render: (v) => <Tag color={v === "closed" ? "red" : "green"}>{t(`status_${v}`)}</Tag>,
    },
    {
      title: t("NumberSample"),
      key: "s",
      width: 160,
      render: (_, y) => <bdi dir="ltr">DM-SI-{y.code}-1</bdi>,
    },
    {
      title: "",
      key: "a",
      width: 220,
      align: "center",
      render: (_, y) => (
        <Space size={6}>
          {perms.close &&
            (y.status === "open" ? (
              <Popconfirm
                title={t("CloseConfirm", { year: y.code })}
                description={t("CloseHint")}
                okButtonProps={{ danger: true }}
                onConfirm={() => run(setFiscalYearStatusAction, { id: y.id, status: "closed" }, t("Closed"))}
              >
                <Button size="small" color="danger" variant="solid" icon={<LockOutlined />}>
                  {t("Close")}
                </Button>
              </Popconfirm>
            ) : (
              <Popconfirm
                title={t("ReopenConfirm", { year: y.code })}
                onConfirm={() => run(setFiscalYearStatusAction, { id: y.id, status: "open" }, t("Reopened"))}
              >
                <Button size="small" color="green" variant="solid" icon={<UnlockOutlined />}>
                  {t("Reopen")}
                </Button>
              </Popconfirm>
            ))}
          {perms.manage && (
            <Button
              size="small"
              color="blue"
              variant="solid"
              icon={<EditOutlined />}
              onClick={() => setEdit({ id: y.id, code: y.code, startDate: y.startDate, endDate: y.endDate })}
            >
              {t("EditDates")}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={t("Title")} />
      <Alert type="info" showIcon className="mb-3" title={t("Hint")} />

      <Card size="small" className="mb-3">
        <Space wrap align="center">
          <span>
            {t("StartMonth")}
            <Tooltip title={t("StartMonthHint")}>
              <QuestionCircleOutlined className="ms-1" />
            </Tooltip>
            :
          </span>
          <Select
            style={{ width: 180 }}
            value={data.startMonth}
            disabled={!perms.manage}
            options={months}
            onChange={(m) => run(setFiscalStartMonthAction, m, t("Saved"))}
          />
        </Space>
      </Card>

      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={data.years}
        columns={columns}
        scroll={{ x: columns.reduce((s, c) => s + c.width, 0) }}
      />

      {edit && (
        <Modal
          open
          title={`${t("EditDates")} ${edit.code}`}
          onCancel={() => setEdit(null)}
          onOk={saveEdit}
          okText={t("Save")}
          confirmLoading={saving}
          mask={{ closable: false }}
        >
          <Space wrap>
            <div>
              <div className="text-xs text-slate-500 mb-1">{t("From")}</div>
              <DayPicker value={edit.startDate} onChange={(v) => v && setEdit((e) => ({ ...e, startDate: v }))} />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">{t("To")}</div>
              <DayPicker value={edit.endDate} onChange={(v) => v && setEdit((e) => ({ ...e, endDate: v }))} />
            </div>
          </Space>
          <Alert type="warning" showIcon className="mt-3" title={t("EditDatesHint")} />
        </Modal>
      )}
    </div>
  );
}

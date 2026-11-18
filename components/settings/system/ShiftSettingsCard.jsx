"use client";

import { useState } from "react";
import { Button, Card, Col, Input, Row, Switch, Tooltip } from "antd";
import {
  DeleteOutlined,
  FieldTimeOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { saveShiftSettingsAction } from "@/actions/shift.actions";
import { isTime } from "@/lib/shift-settings";

const MAX_PERIODS = 6;

// ============================================================
// إعدادات الورديات (المالك) - بتتحفظ لوحدها (مش جوه فورم الإعدادات)
// - أكتر من درج في وردية الفرع / درج واحد والباقيين ينضموا
// - قفل وردية الفرع مع آخر درج / يدوي
// - أوقات الورديات: وردية الفرع بتاخد اسم الفترة اللي اتفتحت فيها
// ============================================================
export default function ShiftSettingsCard({ initial, title }) {
  const t = useTranslations("SystemSettings");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const locale = useLocale();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  const set = (patch) => setValue((v) => ({ ...v, ...patch }));
  const setPeriod = (i, patch) =>
    set({ periods: value.periods.map((p, k) => (k === i ? { ...p, ...patch } : p)) });

  const save = async () => {
    // الوقت لازم يبقى HH:mm (08:00)
    const bad = value.periods.find((p) => !p.arName.trim() || !isTime(p.start) || !isTime(p.end));
    if (bad) return message.warning(t("ShiftPeriodInvalid"));
    setSaving(true);
    const res = await saveShiftSettingsAction(value);
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    setValue(res.data);
    message.success(t("ShiftSettingsSaved"));
  };

  const hint = (text) => (
    <Tooltip title={text}>
      <QuestionCircleOutlined />
    </Tooltip>
  );

  return (
    <Card
      size="small"
      title={title ?? <span><FieldTimeOutlined /> {t("ShiftSettings")}</span>}
      className="mb-4"
      extra={
        <Button type="primary" size="small" icon={<SaveOutlined />} loading={saving} onClick={save}>
          {tButtons("Save")}
        </Button>
      }
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span>
          {t("MultiDrawer")} {hint(t("MultiDrawerHint"))}
        </span>
        <Switch checked={value.multiDrawer} onChange={(v) => set({ multiDrawer: v })} />
      </div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span>
          {t("AutoCloseBranchShift")} {hint(t("AutoCloseBranchShiftHint"))}
        </span>
        <Switch checked={value.autoClose} onChange={(v) => set({ autoClose: v })} />
      </div>

      <div className="mb-1">
        <b>{t("ShiftPeriods")}</b> {hint(t("ShiftPeriodsHint"))}
      </div>
      {value.periods.map((p, i) => (
        <Row key={i} gutter={[8, 8]} className="mb-2" align="middle">
          <Col xs={12} md={7}>
            <Input
              autoComplete="off"
              maxLength={50}
              placeholder={t("PeriodArName")}
              value={p.arName}
              onChange={(e) => setPeriod(i, { arName: e.target.value })}
            />
          </Col>
          <Col xs={12} md={6}>
            <Input
              autoComplete="off"
              maxLength={50}
              placeholder={t("PeriodEnName")}
              value={p.enName}
              onChange={(e) => setPeriod(i, { enName: e.target.value })}
            />
          </Col>
          <Col xs={10} md={4}>
            <Input
              type="time"
              autoComplete="off"
              aria-label={t("PeriodStart")}
              value={p.start}
              onChange={(e) => setPeriod(i, { start: e.target.value })}
            />
          </Col>
          <Col xs={10} md={4}>
            <Input
              type="time"
              autoComplete="off"
              aria-label={t("PeriodEnd")}
              value={p.end}
              onChange={(e) => setPeriod(i, { end: e.target.value })}
            />
          </Col>
          <Col xs={4} md={3}>
            <Button
              danger
              type="text"
              icon={<DeleteOutlined />}
              aria-label={tButtons("Delete")}
              title={tButtons("Delete")}
              onClick={() => set({ periods: value.periods.filter((_, k) => k !== i) })}
            />
          </Col>
        </Row>
      ))}
      {value.periods.length < MAX_PERIODS && (
        <Button
          icon={<PlusOutlined />}
          onClick={() =>
            set({ periods: [...value.periods, { arName: "", enName: "", start: "08:00", end: "16:00" }] })
          }
        >
          {t("AddPeriod")}
        </Button>
      )}
    </Card>
  );
}

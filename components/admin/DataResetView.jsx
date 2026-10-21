"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Card, Checkbox, Input, Tag, Tooltip } from "antd";
import {
  DeleteOutlined,
  LockOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { message, modal } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import PageHeader from "@/components/common/PageHeader";
import {
  getResetCountsAction,
  resetTransactionsAction,
} from "@/actions/data-reset.actions";
import {
  PROTECTED_ITEMS,
  RESET_GROUPS,
  RESET_ITEMS,
  expandSelection,
  requiredBy,
} from "@/lib/data-reset";
import "./admin.css";

// ============================================================
// الإدارة ← تصفير البيانات
// - علامة صح قدام كل نوع، و"تحديد الكل"
// - اللي مربوط باختيارك بيتعلّم تلقائياً (ومكتوب جنبه مطلوب مع إيه)
// - الإعدادات وبيانات الشركة والدخول والأمان والمستخدمين ... برا التصفير خالص
// ============================================================
export default function DataResetView({ initialCounts, canBackup }) {
  const [data, setData] = useState(initialCounts);
  const [chosen, setChosen] = useState(() => new Set());
  const [confirm, setConfirm] = useState("");
  const [resetNumbers, setResetNumbers] = useState(true);
  const [running, setRunning] = useState(false);
  const locale = useLocale();
  const t = useTranslations("DataReset");
  const tAlerts = useTranslations("Alerts");
  const word = locale === "ar" ? "تصفير" : "RESET";
  const { counts, zatca, blocked, production } = data;

  // ممنوع: فيه فواتير إنتاج في النوع ده أو في حاجة لازم تتمسح معاه
  const isBlocked = useMemo(() => {
    const out = {};
    for (const i of RESET_ITEMS) {
      out[i.key] = [...expandSelection([i.key])].some((k) => blocked[k]);
    }
    return out;
  }, [blocked]);

  const effective = useMemo(() => expandSelection([...chosen]), [chosen]);
  const selectable = RESET_ITEMS.filter((i) => !isBlocked[i.key]);
  const allChosen = selectable.every((i) => effective.has(i.key));
  const someChosen = effective.size > 0;

  const toggle = (key, on) => {
    const next = new Set(chosen);
    if (on) next.add(key);
    else next.delete(key);
    setChosen(next);
  };
  const toggleAll = (on) =>
    setChosen(on ? new Set(selectable.map((i) => i.key)) : new Set());
  const toggleGroup = (group, on) => {
    const next = new Set(chosen);
    selectable
      .filter((i) => i.group === group)
      .forEach((i) => (on ? next.add(i.key) : next.delete(i.key)));
    setChosen(next);
  };

  const total = [...effective].reduce((s, k) => s + (counts[k] ?? 0), 0);
  const ready = someChosen && confirm.trim() === word && !running;

  const run = () =>
    modal.confirm({
      title: t("Title"),
      icon: <WarningOutlined style={{ color: "#cf1322" }} />,
      content: (
        <div>
          <p>{t("LastConfirm")}</p>
          <ul className="reset-confirm-list">
            {[...effective].map((k) => (
              <li key={k}>
                {t(`item.${k}`)} <b>({counts[k] ?? 0})</b>
              </li>
            ))}
          </ul>
        </div>
      ),
      okText: t("Confirm"),
      okButtonProps: { danger: true },
      onOk: async () => {
        setRunning(true);
        const res = await resetTransactionsAction({
          confirm,
          resetNumbers,
          keys: [...effective],
        });
        if (!res.success) {
          setRunning(false);
          return showActionError(res, tAlerts, locale);
        }
        const fresh = await getResetCountsAction();
        setRunning(false);
        if (fresh.success) setData(fresh.data);
        setChosen(new Set());
        setConfirm("");
        message.success(t("Done"));
      },
    });

  const nameOf = (k) => t(`item.${k}`);
  const sep = locale === "ar" ? "، " : ", ";

  return (
    <>
      <PageHeader title={t("Title")} />

      <div style={{ maxWidth: 860 }}>
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          title={t("Irreversible")}
          description={
            <span>
              {t("BackupHint")}{" "}
              {canBackup && <Link href="/admin/backup">{t("GoBackup")}</Link>}
            </span>
          }
        />

        {blocked.sales && (
          <Alert
            type="error"
            showIcon
            icon={<LockOutlined />}
            className="mb-4"
            title={t("ProductionLiveTitle")}
            description={t("ProductionLiveText", {
              docs: production?.sent ?? 0,
            })}
          />
        )}

        <Card
          size="small"
          className="mb-4"
          title={t("ChooseTitle")}
          extra={
            <Checkbox
              checked={allChosen && someChosen}
              indeterminate={someChosen && !allChosen}
              onChange={(e) => toggleAll(e.target.checked)}
              disabled={running}
            >
              <b>{t("SelectAll")}</b>
            </Checkbox>
          }
        >
          {RESET_GROUPS.map((group) => {
            const items = RESET_ITEMS.filter((i) => i.group === group);
            const groupSel = items.filter((i) => !isBlocked[i.key]);
            const groupAll =
              groupSel.length > 0 &&
              groupSel.every((i) => effective.has(i.key));
            const groupSome = groupSel.some((i) => effective.has(i.key));
            return (
              <div key={group} className="reset-group">
                <div className="reset-group__head">
                  <Checkbox
                    checked={groupAll}
                    indeterminate={groupSome && !groupAll}
                    onChange={(e) => toggleGroup(group, e.target.checked)}
                    disabled={running || !groupSel.length}
                  >
                    <b>{t(`group.${group}`)}</b>
                  </Checkbox>
                </div>
                {items.map((i) => {
                  const on = effective.has(i.key);
                  // مطلوب مع حاجة تانية متعلّمة: ميتشالش لوحده
                  const reqBy = on ? requiredBy(i.key, chosen) : [];
                  const disabled =
                    running || isBlocked[i.key] || reqBy.length > 0;
                  const z = zatca[i.key];
                  return (
                    <div
                      key={i.key}
                      className={`reset-item ${on ? "is-on" : ""}`}
                    >
                      <Checkbox
                        checked={on}
                        disabled={disabled}
                        onChange={(e) => toggle(i.key, e.target.checked)}
                      >
                        <span className="reset-item__name">
                          {nameOf(i.key)}
                        </span>
                      </Checkbox>
                      <span className="reset-item__count">
                        {counts[i.key] ?? 0}
                      </span>
                      <div className="reset-item__meta">
                        <span className="reset-muted">
                          {t(`hint.${i.key}`)}
                        </span>
                        {z > 0 && (
                          <Tag color="purple">
                            {t("WithZatca", { count: z })}
                          </Tag>
                        )}
                        {i.requires.length > 0 && (
                          <span className="reset-muted">
                            {t("Needs", {
                              list: i.requires.map(nameOf).join(sep),
                            })}
                          </span>
                        )}
                        {reqBy.length > 0 && (
                          <Tag color="orange">
                            {t("RequiredWith", {
                              list: reqBy.map(nameOf).join(sep),
                            })}
                          </Tag>
                        )}
                        {isBlocked[i.key] && (
                          <Tag color="red" icon={<LockOutlined />}>
                            {t("BlockedProduction")}
                          </Tag>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </Card>

        <Card size="small" className="mb-4" title={t("WillKeep")}>
          <div className="reset-protected">
            {PROTECTED_ITEMS.map((k) => (
              <Tooltip key={k} title={t(`protectedHint.${k}`)}>
                <Tag icon={<LockOutlined />} color="green">
                  {t(`protected.${k}`)}
                </Tag>
              </Tooltip>
            ))}
          </div>
          <div className="reset-muted" style={{ marginTop: 8 }}>
            {t("KeepNote")}
          </div>
        </Card>

        <Card
          size="small"
          style={{ borderColor: "#ff4d4f" }}
          title={
            <span style={{ color: "#cf1322" }}>
              <WarningOutlined /> {t("Confirm")}
            </span>
          }
        >
          <div className="mb-3">
            {someChosen ? (
              <span>{t("Summary", { types: effective.size, total })}</span>
            ) : (
              <span className="reset-muted">{t("NothingChosen")}</span>
            )}
          </div>
          <Checkbox
            checked={resetNumbers}
            onChange={(e) => setResetNumbers(e.target.checked)}
            disabled={running}
            className="mb-3"
          >
            {t("ResetNumbers")}
          </Checkbox>
          <div className="reset-muted mb-3">{t("ResetNumbersHint")}</div>

          <div className="mb-1">{t("TypeToConfirm", { word })}</div>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={word}
            disabled={running || !someChosen}
            style={{ maxWidth: 260 }}
            className="mb-3"
          />
          <div>
            <Button
              danger
              type="primary"
              icon={<DeleteOutlined />}
              loading={running}
              disabled={!ready}
              onClick={run}
            >
              {t("Button")}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

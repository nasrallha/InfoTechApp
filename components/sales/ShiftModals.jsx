"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Col,
  Divider,
  Input,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Skeleton,
  Tag,
} from "antd";
import {
  HomeOutlined,
  LockOutlined,
  LoginOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
  UnlockOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { round } from "@/lib/invoice-calc";
import { formatDateTime, formatDay } from "@/lib/dates";
import { formatDocNo } from "@/lib/doc-number";
import { branchShiftName, shiftDay } from "@/lib/shift-label";
import { Link } from "@/i18n/routing";
import {
  addCashMovementAction,
  closeShiftAction,
  getDrawerChoicesAction,
  getMyOpenShiftAction,
  getOpeningSuggestionAction,
  getShiftAction,
  joinDrawerAction,
  openShiftAction,
} from "@/actions/shift.actions";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { usePageActive } from "@/components/common/usePageActive";
import ShiftReport from "./ShiftReport";
import "./shift.css";

export const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 1];
const userName = (u, locale) =>
  u ? (locale === "ar" ? u.arFullname : u.enFullname) : "";

const diffAlert = (diff, t, money, symbol) => ({
  type: diff === 0 ? "success" : diff > 0 ? "info" : "error",
  title:
    diff === 0
      ? t("Balanced")
      : `${diff > 0 ? t("Surplus") : t("Shortage")}: ${money(Math.abs(diff))} ${symbol}`,
});

// ============================================================
// فتح درج (الاستلام) أو الانضمام لدرج مفتوح:
// - وردية الفرع المفتوحة بتظهر فوق (ولو مفيش: بتتفتح مع الدرج)
// - البرنامج يقترح المتروك في الدرج من الدرج السابق على نفس الفرع
// - الكاشير يعدّ الموجود فعلاً، والفرق يتسجل
// - المدير / المشرف / المالك: يقدر ينضم لدرج كاشير مفتوح ويبيع عليه
// ============================================================
export function OpenShiftModal({ open, onClose, onOpened, closable = true }) {
  const [cash, setCash] = useState(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggestion, setSuggestion] = useState(undefined);
  const [choices, setChoices] = useState(null);
  const [joining, setJoining] = useState(null);
  const locale = useLocale();
  const t = useTranslations("Shifts");
  const tAlerts = useTranslations("Alerts");
  const { amount: money, decimals, symbol } = useCurrency();
  // الكاشير بيفضل في الخلفية لما تخرج منه: النافذة تتعمل من جديد لما يرجع يظهر
  const active = usePageActive();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    Promise.all([getOpeningSuggestionAction(), getDrawerChoicesAction()]).then(([res, ch]) => {
      if (!alive) return;
      const s = res.success ? res.data : null;
      setChoices(ch.success ? ch.data : null);
      setSuggestion(s);
      setCash(s ? s.leftCash : 0);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const expected = suggestion?.leftCash ?? null;
  const diff =
    expected == null || cash == null ? null : round(cash - expected, decimals);

  const submit = async () => {
    setSaving(true);
    const res = await openShiftAction({
      openingCash: Number(cash) || 0,
      notes,
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(
      t("ShiftOpened", {
        number: res.data.dayNo
          ? `${formatDocNo("shift", res.data.number, res.data.docCode)} (${res.data.dayNo})`
          : formatDocNo("shift", res.data.number, res.data.docCode),
      }),
    );
    onOpened?.(res.data);
  };

  // الانضمام لدرج مفتوح ← الدرج بيرجع زي الفتح بالظبط (joined)
  const join = async (drawer) => {
    setJoining(drawer.id);
    const res = await joinDrawerAction(drawer.id);
    if (!res.success) {
      setJoining(null);
      return showActionError(res, tAlerts, locale);
    }
    const mine = await getMyOpenShiftAction();
    setJoining(null);
    if (!mine.success || !mine.data) return showActionError(mine, tAlerts, locale);
    message.success(t("JoinedDrawer", { cashier: userName(drawer.user, locale) }));
    onOpened?.(mine.data);
  };

  const bs = choices?.branchShift ?? null;
  const canOpen = choices?.canOpen !== false;
  const joinable = choices?.canJoin ? (choices?.drawers ?? []) : [];

  if (!active) return null;

  return (
    <Modal
      open={open}
      onCancel={closable ? onClose : undefined}
      closable={closable}
      mask={{ closable: false }}
      keyboard={closable}
      title={
        <span>
          <UnlockOutlined /> {t("OpenShift")}
        </span>
      }
      footer={
        <>
          {/* الكاشير مايقدرش يقفل النافذة: يرجع للرئيسية بدل ما يفضل محبوس */}
          {!closable && (
            <Link href="/">
              <Button size="large" icon={<HomeOutlined />}>
                {t("BackHome")}
              </Button>
            </Link>
          )}
          {canOpen && (
            <Button type="primary" size="large" loading={saving} onClick={submit}>
              {t("ReceiveAndOpen")}
            </Button>
          )}
        </>
      }
      destroyOnHidden
    >
      {suggestion === undefined ? (
        <Skeleton active />
      ) : (
        <>
          {/* وردية الفرع: المفتوحة، أو هتتفتح مع الدرج */}
          <Alert
            type={bs ? "success" : "warning"}
            showIcon
            className="mb-3"
            title={
              bs
                ? t("BranchShiftOpen", {
                    name:
                      branchShiftName(bs, locale) ??
                      t("DayShift", { n: bs.dayNo, date: formatDay(shiftDay(bs)) }),
                  })
                : t("BranchShiftWillOpen")
            }
            description={bs ? `${t("OpenedAt")}: ${formatDateTime(bs.openedAt)}` : undefined}
          />
          {/* الانضمام لدرج مفتوح (المدير / المشرف / المالك) */}
          {joinable.length > 0 && (
            <div className="mb-3">
              <div className="mb-1">
                <b>{t("JoinOpenDrawer")}</b>
              </div>
              {joinable.map((x) => (
                <div key={x.id} className="shift-join-row">
                  <span>
                    {userName(x.user, locale)} — <bdi>{formatDocNo("shift", x.number, x.docCode)}</bdi>
                  </span>
                  <Button
                    color="primary"
                    variant="outlined"
                    icon={<LoginOutlined />}
                    loading={joining === x.id}
                    onClick={() => join(x)}
                  >
                    {t("Join")}
                  </Button>
                </div>
              ))}
              {canOpen && <Divider plain>{t("OrOpenNewDrawer")}</Divider>}
            </div>
          )}
          {!canOpen ? (
            <Alert type="info" showIcon title={t(joinable.length ? "SingleDrawerJoin" : "SingleDrawerAsk")} />
          ) : suggestion ? (
            <Alert
              type="info"
              showIcon
              className="mb-3"
              title={t("PreviousLeft", {
                amount: `${money(suggestion.leftCash)} ${symbol}`,
                number: formatDocNo(
                  "shift",
                  suggestion.previousNumber,
                  suggestion.previousDocCode,
                ),
                cashier: userName(suggestion.previousCashier, locale),
              })}
              description={
                suggestion.closedAt
                  ? `${t("ClosedAt")}: ${formatDateTime(suggestion.closedAt)}`
                  : undefined
              }
            />
          ) : (
            <Alert
              type="info"
              showIcon
              className="mb-3"
              title={t("OpenShiftHint")}
            />
          )}
          {canOpen && (
            <>
              <div className="mb-1">
                <b>{t("OpeningCashCounted")}</b>
              </div>
              <InputNumber
                autoFocus
                size="large"
                style={{ width: "100%" }}
                min={0}
                precision={decimals}
                suffix={symbol}
                value={cash}
                onFocus={(e) => e.target.select()}
                onChange={(v) => setCash(v ?? 0)}
                onPressEnter={submit}
              />
              {diff != null && (
                <Alert
                  className="mt-3"
                  showIcon
                  {...diffAlert(diff, t, money, symbol)}
                />
              )}
              <div className="mb-1 mt-3">{t("Notes")}</div>
              <Input
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </>
          )}
        </>
      )}
    </Modal>
  );
}

// ============================================================
// عدّ الفلوس بالفئات + الفكة
// ============================================================
export function DenominationCounter({ value, onChange }) {
  const t = useTranslations("Shifts");
  const { amount: money, decimals, symbol } = useCurrency();
  const total = useMemo(
    () =>
      DENOMINATIONS.reduce((s, d) => s + d * (value[d] || 0), 0) +
      (value.coins || 0),
    [value],
  );
  const set = (k, v) => onChange({ ...value, [k]: v ?? 0 });

  return (
    <div className="shift-den">
      {DENOMINATIONS.map((d) => (
        <div key={d} className="shift-den__row">
          <span className="shift-den__label">
            <b>{d}</b> {symbol}
          </span>
          <span className="shift-den__x">×</span>
          <InputNumber
            min={0}
            precision={0}
            value={value[d] || null}
            placeholder="0"
            onFocus={(e) => e.target.select()}
            onChange={(v) => set(d, v)}
            style={{ width: 110 }}
          />
          <span className="shift-den__sum">{money(d * (value[d] || 0))}</span>
        </div>
      ))}
      <div className="shift-den__row">
        <span className="shift-den__label">{t("Coins")}</span>
        <span className="shift-den__x" />
        <InputNumber
          min={0}
          precision={decimals}
          value={value.coins || null}
          placeholder="0"
          onFocus={(e) => e.target.select()}
          onChange={(v) => set("coins", v)}
          style={{ width: 110 }}
        />
        <span className="shift-den__sum">{money(value.coins || 0)}</span>
      </div>
      <div className="shift-den__total">
        <span>{t("CountedTotal")}</span>
        <b>
          {money(total)} {symbol}
        </b>
      </div>
    </div>
  );
}

const emptyDen = () => ({ coins: 0 });

// ============================================================
// قفل وردية (التسليم):
// 1) عدّ النقدية بالفئات (عدّ أعمى: المفروض لا يظهر إلا بصلاحية)
// 2) إجمالي إيصال تقفيل جهاز الشبكة
// 3) المورّد للخزنة، والباقي يُترك في الدرج للوردية التالية
// ============================================================
export function CloseShiftModal({ shiftId, open, onClose, onClosed }) {
  const [data, setData] = useState(null);
  const [den, setDen] = useState(emptyDen);
  const [card, setCard] = useState(null);
  const [deposited, setDeposited] = useState(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const locale = useLocale();
  const t = useTranslations("Shifts");
  const tAlerts = useTranslations("Alerts");
  const { amount: money, decimals, symbol } = useCurrency();

  useEffect(() => {
    if (!open || !shiftId) return;
    let alive = true;
    setData(null);
    setDen(emptyDen());
    setCard(null);
    setDeposited(null);
    getShiftAction(shiftId).then((res) => {
      if (!alive) return;
      if (!res.success || !res.data) {
        message.error(tAlerts(res.error ?? "ShiftNotFound"));
        return onClose?.();
      }
      setData(res.data);
      setNotes(res.data.notes ?? "");
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shiftId]);

  const counted = round(
    DENOMINATIONS.reduce((s, d) => s + d * (den[d] || 0), 0) + (den.coins || 0),
    decimals,
  );
  const blind = data?.blind;
  const expected = data?.summary.expectedCash;
  const diff =
    blind || expected == null ? null : round(counted - expected, decimals);
  const cardExpected = data?.summary.cardExpected;
  const cardDiff =
    blind || card == null || cardExpected == null
      ? null
      : round(card - cardExpected, decimals);
  const dep = deposited ?? counted;
  const left = round(counted - dep, decimals);

  const submit = async () => {
    if (dep > counted) return message.error(tAlerts("DepositExceedsCash"));
    setSaving(true);
    const denominations = Object.fromEntries(
      [...DENOMINATIONS.map(String), "coins"].map((k) => [k, den[k] || 0]),
    );
    const res = await closeShiftAction({
      id: shiftId,
      denominations,
      cardCounted: card,
      depositedCash: dep,
      notes,
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("ShiftClosedMsg"));
    onClosed?.(res.data);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={860}
      title={
        <span>
          <LockOutlined /> {t("CloseShift")}{" "}
          {data && (
            <Tag>
              {formatDocNo("shift", data.number, data.docCode)}
              {data.dayNo ? ` (${data.dayNo})` : ""}
            </Tag>
          )}
        </span>
      }
      footer={
        <Button
          danger
          type="primary"
          size="large"
          loading={saving}
          onClick={submit}
        >
          {t("ConfirmClose")}
        </Button>
      }
      destroyOnHidden
    >
      {!data ? (
        <Skeleton active />
      ) : (
        <Row gutter={20}>
          <Col xs={24} md={12}>
            <Divider titlePlacement="start">{t("Step1Count")}</Divider>
            {blind && (
              <Alert
                type="warning"
                showIcon
                className="mb-2"
                title={t("BlindCountHint")}
              />
            )}
            <DenominationCounter value={den} onChange={setDen} />
            {diff != null && (
              <Alert
                className="mt-2"
                showIcon
                {...diffAlert(diff, t, money, symbol)}
              />
            )}
          </Col>
          <Col xs={24} md={12}>
            <Divider titlePlacement="start">{t("Step2Card")}</Divider>
            <div className="mb-1">{t("CardTerminalTotal")}</div>
            <InputNumber
              size="large"
              style={{ width: "100%" }}
              min={0}
              precision={decimals}
              suffix={symbol}
              value={card}
              placeholder={t("CardTerminalHint")}
              onChange={(v) => setCard(v)}
            />
            {cardDiff != null && (
              <Alert
                className="mt-2"
                showIcon
                {...diffAlert(cardDiff, t, money, symbol)}
              />
            )}

            <Divider titlePlacement="start">{t("Step3Handover")}</Divider>
            <div className="mb-1">{t("DepositedCash")}</div>
            <InputNumber
              size="large"
              style={{ width: "100%" }}
              min={0}
              max={counted}
              precision={decimals}
              suffix={symbol}
              value={dep}
              onChange={(v) => setDeposited(v ?? 0)}
            />
            <div className="shift-left">
              <span>{t("LeftInDrawer")}</span>
              <b>
                {money(left)} {symbol}
              </b>
            </div>
            <div className="mb-1 mt-3">{t("Notes")}</div>
            <Input.TextArea
              maxLength={500}
              autoSize={{ minRows: 1, maxRows: 3 }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Col>
          {!blind && (
            <Col span={24}>
              <Divider titlePlacement="start">{t("ShiftSummary")}</Divider>
              <ShiftReport summary={data.summary} shift={data} />
            </Col>
          )}
        </Row>
      )}
    </Modal>
  );
}

// ============================================================
// سحب / إضافة نقدية في الدرج (مع السبب)
// ============================================================
export function CashMovementModal({ open, onClose, onDone }) {
  const [type, setType] = useState("out");
  const [amount, setAmount] = useState(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const locale = useLocale();
  const t = useTranslations("Shifts");
  const tAlerts = useTranslations("Alerts");
  const { decimals, symbol } = useCurrency();

  useEffect(() => {
    if (open) {
      setType("out");
      setAmount(null);
      setReason("");
    }
  }, [open]);

  const submit = async () => {
    if (!(amount > 0)) return message.warning(tAlerts("MustBePositive"));
    setSaving(true);
    const res = await addCashMovementAction({ type, amount, reason });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(type === "out" ? t("WithdrawDone") : t("AddDone"));
    onDone?.(res.data);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={t("DrawerCash")}
      footer={
        <Button
          type="primary"
          size="large"
          danger={type === "out"}
          loading={saving}
          onClick={submit}
        >
          {type === "out" ? t("Withdraw") : t("AddCash")}
        </Button>
      }
      destroyOnHidden
    >
      <Segmented
        block
        size="large"
        className="mb-3"
        value={type}
        onChange={setType}
        options={[
          { value: "out", label: t("Withdraw"), icon: <MinusCircleOutlined /> },
          { value: "in", label: t("AddCash"), icon: <PlusCircleOutlined /> },
        ]}
      />
      <div className="mb-1">{t("Amount")}</div>
      <InputNumber
        autoFocus
        size="large"
        style={{ width: "100%" }}
        min={0}
        precision={decimals}
        suffix={symbol}
        value={amount}
        onChange={setAmount}
        onPressEnter={submit}
      />
      <div className="mb-1 mt-3">{t("Reason")}</div>
      <Input
        size="large"
        maxLength={255}
        placeholder={
          type === "out" ? t("WithdrawReasonHint") : t("AddReasonHint")
        }
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </Modal>
  );
}

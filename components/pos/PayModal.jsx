"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Input, InputNumber, Modal, Select, Space } from "antd";
import {
  BankOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CreditCardOutlined,
  DeleteOutlined,
  DollarOutlined,
  MobileOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { round } from "@/lib/invoice-calc";
import { message } from "@/components/common/feedback";
import { useCurrency } from "@/components/common/CurrencyProvider";

const ICON = {
  cash: <DollarOutlined />,
  card: <CreditCardOutlined />,
  wallet: <MobileOutlined />,
  transfer: <BankOutlined />,
};
const COLOR = {
  cash: "#16a34a",
  card: "#2563eb",
  wallet: "#7c3aed",
  transfer: "#0891b2",
};

let seq = 0;
const row = (methodId, amount) => ({
  key: ++seq,
  methodId,
  amount,
  reference: "",
});

// ============================================================
// الدفع في الكاشير
// - زر لكل طريقة دفع (نقدي، شبكة ...) ← الإجمالي كله بالطريقة دي
// - النقدي: "المستلم من العميل" بأزرار فئات سريعة ← الباقي للعميل
// - "تقسيم" ← أكثر من طريقة (نقدي + شبكة)
// - "آجل" (بصلاحية ومع عميل) ← المتبقي على حساب العميل
// onPay({ payments, tendered })
// ============================================================
export default function PayModal({
  open,
  total,
  methods,
  creditMethod,
  hasCustomer,
  loading,
  onCancel,
  onPay,
}) {
  const locale = useLocale();
  const t = useTranslations("Pos");
  const { amount: money, decimals, symbol } = useCurrency();
  const nameOf = (m) => (locale === "ar" ? m.arName : m.enName);
  const byId = useMemo(() => new Map(methods.map((m) => [m.id, m])), [methods]);
  const cash = methods.find((m) => m.type === "cash") ?? methods[0];

  const [rows, setRows] = useState([]);
  const [tendered, setTendered] = useState(null);

  // كل فتح: دفعة واحدة نقدي بالإجمالي
  useEffect(() => {
    if (!open) return;
    setRows(cash ? [row(cash.id, total)] : []);
    setTendered(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const paid = round(
    rows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    decimals,
  );
  const remaining = round(total - paid, decimals);
  const single = rows.length === 1 ? rows[0] : null;
  const singleCash = single && byId.get(single.methodId)?.type === "cash";
  const change =
    singleCash && tendered != null ? round(tendered - total, decimals) : 0;

  const choose = (m) => {
    setRows([row(m.id, total)]);
    setTendered(null);
  };
  const split = () => {
    const other =
      methods.find((m) => !rows.some((r) => r.methodId === m.id)) ?? cash;
    setRows((prev) => [...prev, row(other.id, Math.max(0, remaining))]);
  };
  const credit = () => {
    setRows([]);
    setTendered(null);
  };
  const patch = (key, p) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));

  // فئات سريعة للمبلغ المستلم
  const bills = useMemo(() => {
    const list = [total];
    for (const step of [5, 10, 50, 100]) {
      const v = Math.ceil(total / step) * step;
      if (v > total && !list.includes(v)) list.push(v);
    }
    for (const v of [100, 200, 500])
      if (v > total && !list.includes(v)) list.push(v);
    return list.sort((a, b) => a - b).slice(0, 6);
  }, [total]);

  const confirm = () => {
    if (rows.some((r) => !(Number(r.amount) > 0)))
      return message.warning(t("AmountRequired"));
    if (paid > total + 1e-9) return message.warning(t("PaidExceeds"));
    if (remaining > 0 && !creditMethod) {
      return message.warning(
        hasCustomer ? t("CreditNotAllowed") : t("PayFullOrCustomer"),
      );
    }
    for (const r of rows) {
      if (byId.get(r.methodId)?.requiresReference && !r.reference?.trim()) {
        return message.warning(t("ReferenceRequired"));
      }
    }
    if (singleCash && tendered != null && tendered < total) {
      return message.warning(t("TenderedLess"));
    }
    onPay({
      payments: rows.map((r) => ({
        paymentMethodId: r.methodId,
        amount: Number(r.amount),
        reference: r.reference || undefined,
      })),
      tendered: singleCash && tendered ? Number(tendered) : undefined,
    });
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      width={640}
      centered
      destroyOnHidden
      title={t("Payment")}
      footer={
        <Button
          type="primary"
          size="large"
          icon={<CheckOutlined />}
          loading={loading}
          onClick={confirm}
          style={{
            background: "#16a34a",
            borderColor: "#16a34a",
            minWidth: 200,
          }}
        >
          {t("ConfirmPay")}
        </Button>
      }
    >
      <div className="pos-paid-total mb-3">
        {money(total)} <span style={{ fontSize: 20 }}>{symbol}</span>
      </div>

      {/* طرق الدفع */}
      <div className="pos-methods mb-3">
        {methods.map((m) => {
          const active = single?.methodId === m.id;
          return (
            <Button
              key={m.id}
              className="pos-method"
              icon={ICON[m.type]}
              type={active ? "primary" : "default"}
              style={
                active
                  ? { background: COLOR[m.type], borderColor: COLOR[m.type] }
                  : undefined
              }
              onClick={() => choose(m)}
            >
              {nameOf(m)}
            </Button>
          );
        })}
        {creditMethod && (
          <Button
            className="pos-method"
            icon={<ClockCircleOutlined />}
            type={rows.length === 0 ? "primary" : "default"}
            style={
              rows.length === 0
                ? { background: "#ea580c", borderColor: "#ea580c" }
                : undefined
            }
            onClick={credit}
          >
            {nameOf(creditMethod)}
          </Button>
        )}
      </div>

      {/* نقدي بدفعة واحدة: المستلم والباقي */}
      {singleCash && (
        <div className="mb-3">
          <div className="mb-1">{t("Tendered")}</div>
          <InputNumber
            autoFocus
            size="large"
            style={{ width: "100%" }}
            min={0}
            precision={decimals}
            suffix={symbol}
            value={tendered}
            placeholder={money(total)}
            onChange={setTendered}
            onPressEnter={confirm}
          />
          <div className="pos-bills mt-2">
            {bills.map((b) => (
              <Button key={b} onClick={() => setTendered(b)}>
                {money(b)}
              </Button>
            ))}
          </div>
          {tendered != null && (
            <div
              className="pos-change mt-3"
              style={{
                background: change >= 0 ? "#ecfdf5" : "#fef2f2",
                color: change >= 0 ? "#047857" : "#b91c1c",
              }}
            >
              {change >= 0 ? t("ChangeDue") : t("Missing")}:{" "}
              {money(Math.abs(change))} {symbol}
            </div>
          )}
        </div>
      )}

      {/* تقسيم على أكثر من طريقة / مبلغ جزئي */}
      {(!singleCash || rows.length > 1) && rows.length > 0 && (
        <div className="mb-2">
          {rows.map((r) => {
            const m = byId.get(r.methodId);
            return (
              <Space.Compact key={r.key} block className="mb-2">
                <Select
                  style={{ width: 170 }}
                  value={r.methodId}
                  onChange={(v) => patch(r.key, { methodId: v })}
                  options={methods.map((x) => ({
                    value: x.id,
                    label: nameOf(x),
                  }))}
                />
                <InputNumber
                  style={{ width: 160 }}
                  min={0}
                  precision={decimals}
                  value={r.amount}
                  onChange={(v) => patch(r.key, { amount: v ?? 0 })}
                />
                {m?.requiresReference && (
                  <Input
                    style={{ width: 170 }}
                    placeholder={t("Reference")}
                    value={r.reference}
                    onChange={(e) =>
                      patch(r.key, { reference: e.target.value })
                    }
                  />
                )}
                {rows.length > 1 && (
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() =>
                      setRows((prev) => prev.filter((x) => x.key !== r.key))
                    }
                  />
                )}
              </Space.Compact>
            );
          })}
        </div>
      )}

      <Space wrap>
        <Button
          icon={<PlusOutlined />}
          onClick={split}
          disabled={!methods.length}
        >
          {t("Split")}
        </Button>
      </Space>

      {remaining !== 0 && (
        <Alert
          className="mt-3"
          showIcon
          type={remaining > 0 ? (creditMethod ? "warning" : "error") : "error"}
          title={
            remaining > 0
              ? `${t("RemainingCredit")}: ${money(remaining)} ${symbol}`
              : t("PaidExceeds")
          }
        />
      )}
    </Modal>
  );
}

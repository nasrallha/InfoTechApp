"use client";

import { useEffect } from "react";
import { Alert, Button, Input, InputNumber, Select, Space, Tag } from "antd";
import {
  BankOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CreditCardOutlined,
  DeleteOutlined,
  DollarOutlined,
  MobileOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { round } from "@/lib/invoice-calc";
import { paymentStatus, PAYMENT_STATUS_COLOR } from "@/lib/doc-number";
import { useCurrency } from "@/components/common/CurrencyProvider";

// ============================================================
// المدفوعات
// - في البداية لا يوجد اختيار: المستخدم لازم يختار طريقة الدفع بنفسه
// - اختيار طريقة (كاش، تحويل ...) ← دفعة بالإجمالي، ويمكن تعديل المبلغ
//   (مثلاً 5000 فقط) والباقي يصبح آجل تلقائياً = سداد جزئي
// - "آجل" ← لا مدفوعات، والإجمالي كله على الحساب
// - "دفعة بطريقة أخرى" ← تقسيم المبلغ على أكثر من طريقة (كاش + تحويل)
// value:
//   null = لم يختر بعد
//   []   = آجل بالكامل
//   [{ key, paymentMethodId, amount, reference, auto }]
//     auto: المبلغ يتبع إجمالي الفاتورة حتى يعدّله المستخدم
// creditMethod: طريقة "الآجل" من الإعدادات (اسمها يظهر على الزر)
// creditLabel: نص الآجل (للمورد / يُخصم من حسابه ...)
// ============================================================
let keySeq = 0;
export const newPaymentKey = () => `p${++keySeq}`;

const CREDIT = "credit";

// لون وأيقونة كل نوع طريقة دفع (نفس الألوان في كل الشاشات)
const TYPE_STYLE = {
  cash: { color: "green", icon: <DollarOutlined /> },
  card: { color: "blue", icon: <CreditCardOutlined /> },
  wallet: { color: "purple", icon: <MobileOutlined /> },
  transfer: { color: "cyan", icon: <BankOutlined /> },
  credit: { color: "orange", icon: <ClockCircleOutlined /> },
};

export default function PaymentsEditor({
  methods,
  creditMethod,
  total,
  value,
  onChange,
  creditLabel,
  // المبيعات: الآجل بصلاحية ومع عميل محدد
  allowCredit = true,
}) {
  const locale = useLocale();
  const t = useTranslations("Purchases");
  const { amount: money, decimals, symbol } = useCurrency();
  const nameOf = (m) => (locale === "ar" ? m.arName : m.enName);
  const methodById = new Map(methods.map((m) => [m.id, m]));

  const rows = value ?? [];
  const chosen = value !== null;
  const paid = round(
    rows.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    decimals,
  );
  const remaining = round(total - paid, decimals);
  const status = paymentStatus(total, paid);

  // دفعة واحدة لم يعدّل مبلغها: تتبع الإجمالي (لو أضاف أصنافاً بعد الاختيار)
  useEffect(() => {
    if (rows.length === 1 && rows[0].auto && rows[0].amount !== total) {
      onChange([{ ...rows[0], amount: total }]);
    }
  }, [total, rows, onChange]);

  // الاختيار الحالي في الأزرار: طريقة واحدة / آجل / لا شيء (مقسّم أو لم يختر)
  const current = !chosen
    ? undefined
    : rows.length === 0
      ? CREDIT
      : rows.length === 1
        ? rows[0].paymentMethodId
        : undefined;

  const choose = (v) => {
    if (v === CREDIT) return onChange([]);
    onChange([
      {
        key: newPaymentKey(),
        paymentMethodId: v,
        amount: total,
        reference: "",
        auto: true,
      },
    ]);
  };

  const update = (key, patch) =>
    onChange(rows.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const remove = (key) => onChange(rows.filter((p) => p.key !== key));

  // دفعة إضافية بطريقة أخرى بالمبلغ المتبقي
  const addRow = () =>
    onChange([
      ...rows.map((p) => ({ ...p, auto: false })),
      {
        key: newPaymentKey(),
        paymentMethodId:
          methods.find((m) => !rows.some((p) => p.paymentMethodId === m.id))
            ?.id ?? methods[0]?.id,
        amount: Math.max(0, remaining),
        reference: "",
        auto: false,
      },
    ]);

  return (
    <div className="pur-payments">
      {/* ============ اختيار طريقة الدفع ============ */}
      <div className="mb-3">
        <div className="pur-payments__hint mb-2">
          {t("ChoosePaymentMethod")}
        </div>
        {/* زر ملوّن لكل طريقة: المختار ممتلئ، والباقي بإطار ملوّن */}
        <Space wrap>
          {[
            ...methods.map((m) => ({
              value: m.id,
              label: nameOf(m),
              type: m.type,
            })),
            ...(allowCredit
              ? [
                  {
                    value: CREDIT,
                    label: creditMethod ? nameOf(creditMethod) : t("AllCredit"),
                    type: CREDIT,
                  },
                ]
              : []),
          ].map((b) => {
            const style = TYPE_STYLE[b.type] ?? TYPE_STYLE.cash;
            const active = current === b.value;
            return (
              <Button
                key={b.value}
                size="large"
                color={style.color}
                variant={active ? "solid" : "outlined"}
                icon={active ? <CheckCircleFilled /> : style.icon}
                onClick={() => choose(b.value)}
              >
                {b.label}
              </Button>
            );
          })}
        </Space>
      </div>

      {!chosen && (
        <Alert
          type="info"
          showIcon
          className="mb-3"
          title={t("PaymentNotChosen")}
        />
      )}

      {/* ============ الدفعات ============ */}
      {rows.map((p) => {
        const method = methodById.get(p.paymentMethodId);
        return (
          <div key={p.key} className="pur-payments__row">
            <Select
              style={{ width: 170 }}
              value={p.paymentMethodId}
              onChange={(v) => update(p.key, { paymentMethodId: v })}
              options={methods.map((m) => ({ value: m.id, label: nameOf(m) }))}
            />
            <InputNumber
              style={{ width: 170 }}
              min={0}
              precision={decimals}
              value={p.amount}
              onFocus={(e) => e.target.select()}
              onChange={(v) => update(p.key, { amount: v ?? 0, auto: false })}
              suffix={symbol}
            />
            {method?.requiresReference && (
              <Input
                style={{ width: 170 }}
                placeholder={t("Reference")}
                status={p.reference?.trim() ? undefined : "warning"}
                value={p.reference}
                maxLength={100}
                onChange={(e) => update(p.key, { reference: e.target.value })}
              />
            )}
            {rows.length > 1 && (
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => remove(p.key)}
              />
            )}
          </div>
        );
      })}

      {rows.length > 0 && remaining > 0 && (
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addRow}
          className="mb-3"
        >
          {t("AddPayment")}
        </Button>
      )}

      {/* ============ الملخص ============ */}
      {chosen && (
        <div className="pur-payments__summary">
          {total > 0 && (
            <div>
              <Tag color={PAYMENT_STATUS_COLOR[status]}>
                {t(`paymentStatus.${status}`)}
              </Tag>
            </div>
          )}
          <div>
            <span>{t("Paid")}</span>
            <b>{money(paid)}</b>
          </div>
          <div>
            <span>{creditLabel}</span>
            <b>
              {remaining > 0 ? (
                <Tag color="orange">{money(remaining)}</Tag>
              ) : (
                <Tag color="green">{money(0)}</Tag>
              )}
            </b>
          </div>
        </div>
      )}

      {remaining < 0 && (
        <Alert
          type="error"
          showIcon
          className="mt-2"
          title={t("PaidExceedsTotal")}
        />
      )}
    </div>
  );
}

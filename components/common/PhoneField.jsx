"use client";

import { Form, Input } from "antd";
import { useTranslations } from "next-intl";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { phoneRule } from "@/lib/phone";

// ============================================================
// خانة الجوال: الشكل حسب بلد الشغل (العملة الأساسية)
// ريال ← 05XXXXXXXX (10 أرقام) | جنيه ← 01XXXXXXXXX (11 رقم) | غيرهم 7-15
// (نفس القاعدة في السيرفر: lib/phone-check)
// ============================================================
export function usePhoneRule() {
  const { code } = useCurrency();
  const tAlerts = useTranslations("Alerts");
  const r = phoneRule(code);
  return {
    rule: { pattern: r.re, message: tAlerts(r.error) },
    input: {
      dir: "ltr",
      inputMode: "tel",
      autoComplete: "off",
      maxLength: r.max,
      placeholder: r.example || undefined,
    },
  };
}

// rules: قواعد زيادة (مثلاً إجباري) | inputProps: خصائص زيادة للخانة
export default function PhoneField({
  name = "phone",
  rules = [],
  inputProps,
  ...itemProps
}) {
  const { rule, input } = usePhoneRule();
  return (
    <Form.Item name={name} rules={[...rules, rule]} {...itemProps}>
      <Input {...input} {...inputProps} />
    </Form.Item>
  );
}

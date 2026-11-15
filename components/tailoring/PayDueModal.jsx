"use client";

import { useState } from "react";
import {
  Col,
  Descriptions,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
} from "antd";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useMounted } from "@/components/common/ClientOnly";
import { payTailorOrderAction } from "@/actions/tailoring.actions";

// ============================================================
// دفع المتبقي على طلب التفصيل (من شاشة الطلبات أو الطلب نفسه)
// بيانات العميل والطلب + المبلغ (افتراضي = المتبقي كله) وطريقة الدفع
// ← سند قبض على العميل من غير ما الكاشير يفتح شاشة السندات
// order: { id, docNo, customer, total, paid, due } | onDone: بعد الدفع
// ============================================================
export default function PayDueModal({
  order,
  paymentMethods = [],
  onClose,
  onDone,
}) {
  const t = useTranslations("Tailoring");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const mounted = useMounted();
  const nameOf = (x) =>
    x ? (locale === "ar" ? x.arName : x.enName || x.arName) : "";
  const [amount, setAmount] = useState(order?.due ?? 0);
  const [methodId, setMethodId] = useState(paymentMethods[0]?.id ?? null);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const needsRef = paymentMethods.find(
    (m) => m.id === methodId,
  )?.requiresReference;

  const pay = async () => {
    if (!(amount > 0)) return message.error(t("AmountRequired"));
    if (amount > order.due + 0.009)
      return message.error(
        tAlerts("TailorAmountOverDue", { due: money(order.due) }),
      );
    if (!methodId) return message.error(tAlerts("PaymentMethodNotFound"));
    setBusy(true);
    const res = await payTailorOrderAction({
      id: order.id,
      paymentMethodId: methodId,
      amount,
      reference: reference || null,
    });
    setBusy(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(
      res.data.delivered
        ? t("PaidAndDelivered", { amount: money(amount) })
        : t("PaymentSaved", { amount: money(amount) }),
    );
    onDone?.(res.data);
    onClose();
  };

  if (!mounted || !order) return null;
  return (
    <Modal
      open
      title={`${t("PayDue")} - ${order.docNo}`}
      onCancel={onClose}
      onOk={pay}
      okText={t("ConfirmPayment")}
      confirmLoading={busy}
      width={560}
    >
      <Descriptions
        size="small"
        bordered
        column={1}
        className="mb-3"
        items={[
          {
            key: "c",
            label: t("Customer"),
            children: (
              <span>
                <b>{nameOf(order.customer)}</b>{" "}
                <bdi className="text-slate-500">({order.customer.code})</bdi>
              </span>
            ),
          },
          {
            key: "p",
            label: t("Phone"),
            children: <bdi>{order.customer.phone ?? "—"}</bdi>,
          },
          { key: "t", label: t("Total"), children: money(order.total) },
          { key: "pd", label: t("Paid"), children: money(order.paid) },
          { key: "d", label: t("Due"), children: <b>{money(order.due)}</b> },
        ]}
      />
      <Row gutter={[12, 12]}>
        <Col xs={12}>
          <div className="text-xs text-slate-500 mb-1">{t("PayAmount")}</div>
          <InputNumber
            autoFocus
            style={{ width: "100%" }}
            min={0}
            max={order.due}
            value={amount}
            onChange={(v) => setAmount(v ?? 0)}
            onPressEnter={pay}
          />
        </Col>
        <Col xs={12}>
          <div className="text-xs text-slate-500 mb-1">
            {t("PaymentMethod")}
          </div>
          <Select
            style={{ width: "100%" }}
            value={methodId ?? undefined}
            options={paymentMethods.map((m) => ({
              value: m.id,
              label: nameOf(m),
            }))}
            onChange={setMethodId}
          />
        </Col>
        {needsRef && (
          <Col xs={24}>
            <div className="text-xs text-slate-500 mb-1">{t("Reference")}</div>
            <Input
              dir="ltr"
              autoComplete="off"
              maxLength={100}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Col>
        )}
      </Row>
      <p className="text-xs text-slate-500 mt-3 mb-0">{t("PayDueHint")}</p>
    </Modal>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Alert, Col, Descriptions, Form, Input, InputNumber, Modal, Radio, Row, Segmented, Select, Spin } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import {
  issueInstallmentInvoiceAction,
  previewInstallmentAction,
  updateInstallmentInvoiceAction,
} from "@/actions/rent-contract.actions";
import { formatDay } from "@/lib/dates";
import { useMounted } from "@/components/common/ClientOnly";

// ============================================================
// إصدار فاتورة دفعة الإيجار (من العقد أو تقرير الاستحقاقات)
// - مدفوعة بالكامل / سداد جزئي / آجل على المستأجر
// - السداد الجزئي: الباقي آجل على الفاتورة (يتسدد بسند بعدين)
//   أو يترحل على الدفعة الجاية (الفاتورة بالمدفوع بس)
// inst: { id, seq, periodFrom, periodTo, amount } | onDone(saleId): بعد الإصدار (الطباعة)
// edit: تعديل فاتورة موجودة بنفس رقمها (القيمة + السداد) - القيم من الفاتورة الحالية
// ============================================================

// السداد الحالي للفاتورة (وضع التعديل)
function currentValues(inst, paymentMethods) {
  const sale = inst.sale;
  const pm = sale.payment;
  const base = {
    amount: inst.amount + (inst.carried ?? 0),
    paymentMethodId: pm?.paymentMethodId ?? paymentMethods[0]?.id,
    reference: pm?.reference ?? "",
  };
  // اترحل منها جزء ← جزئي والباقي مترحّل (المدفوع = إجمالي الفاتورة)
  if (inst.carried > 0)
    return { ...base, status: "partial", paidAmount: sale.totalAmount, remainder: "carry" };
  if (!pm) return { ...base, status: "credit", paidAmount: null, remainder: "credit" };
  if (sale.remainingAmount <= 0) return { ...base, status: "full", paidAmount: null, remainder: "credit" };
  return {
    ...base,
    status: "partial",
    paidAmount: sale.totalAmount - sale.remainingAmount,
    remainder: "credit",
  };
}

export default function IssueInvoiceModal({ inst, paymentMethods = [], onClose, onDone, edit = false }) {
  const t = useTranslations("RealEstate");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const [form] = Form.useForm();
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const status = Form.useWatch("status", form);
  const methodId = Form.useWatch("paymentMethodId", form);
  const needsRef = paymentMethods.find((m) => m.id === methodId)?.requiresReference;
  // التعديل: القيمة الجديدة ← المعاينة تتحسب تاني
  const amount = Form.useWatch("amount", form);
  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName || x.arName);
  // النافذة في المتصفح بس (forceRender من غير hydration error)
  const mounted = useMounted();

  // الإجمالي شامل الضريبة (نفس حساب الفاتورة) + هل فيه دفعة جاية
  useEffect(() => {
    if (!inst) return;
    let alive = true;
    previewInstallmentAction({ id: inst.id }).then((res) => {
      if (!alive) return;
      if (!res.success) {
        showActionError(res, tAlerts, locale);
        return onClose();
      }
      setPreview(res.data);
    });
    return () => {
      alive = false;
      setPreview(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inst?.id]);

  // التعديل: إجمالي القيمة الجديدة شامل الضريبة (بعد ما الكتابة تقف)
  useEffect(() => {
    if (!edit || !inst || !preview || !(amount > 0) || amount === preview.amount) return;
    const timer = setTimeout(() => {
      previewInstallmentAction({ id: inst.id, amount }).then((res) => {
        if (res.success) setPreview(res.data);
      });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  const submit = async (v) => {
    setSaving(true);
    const pays = v.status !== "credit";
    const save = edit ? updateInstallmentInvoiceAction : issueInstallmentInvoiceAction;
    const res = await save({
      id: inst.id,
      ...(edit ? { amount: v.amount } : {}),
      paymentMethodId: pays ? v.paymentMethodId : null,
      reference: pays ? v.reference : null,
      paidAmount: v.status === "partial" ? v.paidAmount : null,
      remainder: v.remainder ?? "credit",
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t(edit ? "InvoiceUpdated" : "InvoiceIssued"));
    onDone?.(res.data.saleId);
    onClose();
  };

  if (!mounted) return null;
  return (
    <Modal
      open={Boolean(inst)}
      title={inst ? `${t(edit ? "EditInvoice" : "IssueInvoice")} - ${t("InstallmentNo", { n: inst.seq })}` : ""}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={t(edit ? "SaveChanges" : "IssueInvoice")}
      okButtonProps={{ disabled: !preview }}
      confirmLoading={saving}
      width={640}
      forceRender
    >
      {/* بعد القفل: inst بيبقى فاضي قبل ما المعاينة تتمسح */}
      {!preview || !inst ? (
        <div className="py-6 text-center">
          <Spin />
        </div>
      ) : (
        <>
          <Descriptions
            size="small"
            bordered
            column={1}
            className="mb-3"
            items={[
              {
                key: "p",
                label: t("Period"),
                children: (
                  <bdi>
                    {formatDay(inst.periodFrom)} - {formatDay(inst.periodTo)}
                  </bdi>
                ),
              },
              ...(edit ? [] : [{ key: "a", label: t("AmountBeforeTax"), children: money(preview.amount) }]),
              { key: "t", label: t("Vat"), children: money(preview.tax) },
              { key: "g", label: t("TotalWithTax"), children: <b>{money(preview.total)}</b> },
            ]}
          />
          {/* القيم الافتراضية في الفورم نفسه (بيترسم بعد المعاينة) */}
          <Form
            key={inst.id}
            form={form}
            layout="vertical"
            autoComplete="off"
            onFinish={submit}
            initialValues={
              edit && inst.sale
                ? currentValues(inst, paymentMethods)
                : {
                    status: "full",
                    paymentMethodId: paymentMethods[0]?.id,
                    reference: "",
                    paidAmount: null,
                    remainder: "credit",
                  }
            }
          >
            {edit && (
              <Form.Item
                name="amount"
                label={t("AmountBeforeTax")}
                tooltip={t("EditInvoiceHint")}
                rules={[{ required: true, message: tAlerts("RequiredField") }]}
              >
                <InputNumber min={0.01} style={{ width: "100%" }} />
              </Form.Item>
            )}
            <Form.Item name="status" label={t("PaymentStatus")}>
              <Segmented
                block
                options={[
                  { value: "full", label: t("PaidFull") },
                  { value: "partial", label: t("PaidPartial") },
                  { value: "credit", label: t("OnCredit") },
                ]}
              />
            </Form.Item>
            {status !== "credit" && (
              <Row gutter={[12, 0]}>
                <Col xs={24} md={status === "partial" ? 8 : 12}>
                  <Form.Item
                    name="paymentMethodId"
                    label={t("PaymentMethod")}
                    rules={[{ required: true, message: tAlerts("RequiredField") }]}
                  >
                    <Select options={paymentMethods.map((m) => ({ value: m.id, label: nameOf(m) }))} />
                  </Form.Item>
                </Col>
                {status === "partial" && (
                  <Col xs={24} md={8}>
                    <Form.Item
                      name="paidAmount"
                      label={t("PaidNow")}
                      tooltip={t("PaidNowHint")}
                      rules={[
                        { required: true, message: tAlerts("RequiredField") },
                        {
                          validator: (_, v) =>
                            // = الإجمالي ← مدفوعة بالكامل
                            v > 0 && v <= preview.total
                              ? Promise.resolve()
                              : Promise.reject(new Error(t("PaidNowRange", { total: money(preview.total) }))),
                        },
                      ]}
                    >
                      <InputNumber min={0} style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                )}
                {needsRef && (
                  <Col xs={24} md={status === "partial" ? 8 : 12}>
                    <Form.Item
                      name="reference"
                      label={t("PaymentReference")}
                      rules={[{ required: true, whitespace: true, message: tAlerts("RequiredField") }]}
                    >
                      <Input maxLength={100} dir="ltr" />
                    </Form.Item>
                  </Col>
                )}
              </Row>
            )}
            {status === "partial" && (
              <Form.Item name="remainder" label={t("RemainderHow")}>
                <Radio.Group
                  options={[
                    { value: "credit", label: t("RemainderCredit") },
                    { value: "carry", label: t("RemainderCarry"), disabled: !preview.hasNext },
                  ]}
                />
              </Form.Item>
            )}
            {status === "partial" && !preview.hasNext && (
              <Alert type="info" showIcon className="mb-2" title={t("NoNextInstallment")} />
            )}
            <p className="text-xs text-slate-500 mb-0">{t("InvoicePayHint")}</p>
          </Form>
        </>
      )}
    </Modal>
  );
}

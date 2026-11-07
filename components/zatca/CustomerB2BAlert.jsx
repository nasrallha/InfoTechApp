"use client";

import { useState } from "react";
import { Alert, Button, Col, Form, Input, Modal, Row, Select } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { useCan } from "@/components/auth/AuthProvider";
import { applyFieldErrors } from "@/lib/form-errors";
import { BUYER_ID_SCHEMES, buyerMissing, isB2BCustomer } from "@/lib/zatca-tax";
import { completeCustomerB2BAction } from "@/actions/customer.actions";
import { listSep } from "@/lib/list-sep";

// ============================================================
// العميل اللي له رقم ضريبي = شركة (فاتورته ضريبية)
// لو بياناته ناقصة (العنوان الوطني / رقم ضريبي غلط): تنبيه + زرار يكمّلها من مكانه
// customer: العميل المختار (بالعنوان) | compact: للكاشير
// ============================================================
export default function CustomerB2BAlert({ customer, compact = false }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const locale = useLocale();
  const t = useTranslations("Zatca");
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const can = useCan();

  if (!isB2BCustomer(customer)) return null;
  const missing = buyerMissing(customer);
  if (!missing.length) return null;

  const canEdit = can("customers.update");
  const byVat = Boolean(customer.taxNo && String(customer.taxNo).trim());
  const name = locale === "ar" ? customer.arName : customer.enName;

  const openForm = () => {
    form.setFieldsValue({
      taxNo: customer.taxNo ?? "",
      idScheme: customer.idScheme ?? undefined,
      idNumber: customer.idNumber ?? "",
      city: customer.city ?? "",
      district: customer.district ?? "",
      street: customer.street ?? "",
      buildingNo: customer.buildingNo ?? "",
      additionalNo: customer.additionalNo ?? "",
      postalCode: customer.postalCode ?? "",
    });
    setOpen(true);
  };

  const save = async (values) => {
    setSaving(true);
    const res = await completeCustomerB2BAction({
      id: customer.id,
      countryCode: customer.countryCode ?? "SA",
      ...values,
    });
    setSaving(false);
    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      message.error(tAlerts(res.error));
      return;
    }
    message.success(tAlerts("CustomerUpdated"));
    setOpen(false);
  };

  const req = [
    {
      required: true,
      whitespace: true,
      message: tAlerts("B2BFieldRequired"),
    },
  ];
  const digits = (pattern, key) => [{ pattern, message: tAlerts(key) }];

  return (
    <>
      <Alert
        type="warning"
        showIcon
        className={compact ? "mt-2" : "mt-2 mb-1"}
        title={t("B2BIncomplete", { name })}
        description={
          compact ? null : (
            <span>
              {t("B2BMissing")}:{" "}
              {missing.map((k) => t(`missing.${k}`)).join(listSep(locale))}
            </span>
          )
        }
        action={
          canEdit ? (
            <Button size="small" type="primary" onClick={openForm}>
              {t("CompleteCustomer")}
            </Button>
          ) : null
        }
      />
      {!canEdit && !compact && (
        <div className="zatca-muted mt-1">{t("AskAdminToComplete")}</div>
      )}

      <Modal
        open={open}
        title={`${t("CompleteCustomer")} — ${name}`}
        onCancel={() => setOpen(false)}
        okText={tButtons("Save")}
        cancelText={tButtons("Cancel")}
        confirmLoading={saving}
        onOk={() => form.submit()}
        destroyOnHidden
        width={640}
      >
        <Alert
          type="info"
          showIcon
          className="mb-3"
          title={tForm("B2BAddressHint")}
        />
        <Form form={form} layout="vertical" onFinish={save}>
          <Row gutter={[16, 0]}>
            {/* العميل اللي ليه رقم ضريبي: نكمّل الرقم الضريبي
                واللي مربوط بمعرّف (سجل / رقم موحد / هوية ...): نكمّل المعرّف */}
            {byVat ? (
              <Col xs={24} md={12}>
                <Form.Item
                  name="taxNo"
                  label={tForm("TaxNo")}
                  rules={[...req, ...digits(/^3\d{13}3$/, "TaxNoInvalidZatca")]}
                >
                  <Input inputMode="numeric" maxLength={15} />
                </Form.Item>
              </Col>
            ) : (
              <>
                <Col xs={12} md={6}>
                  <Form.Item
                    name="idScheme"
                    label={tForm("IdScheme")}
                    rules={req}
                  >
                    <Select
                      options={BUYER_ID_SCHEMES.map((code) => ({
                        value: code,
                        label: `${tForm(`idSchemes.${code}`)} (${code})`,
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item
                    name="idNumber"
                    label={tForm("IdNumber")}
                    rules={req}
                  >
                    <Input maxLength={30} />
                  </Form.Item>
                </Col>
              </>
            )}

            <Col xs={24} md={8}>
              <Form.Item name="city" label={tForm("City")} rules={req}>
                <Input maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="district" label={tForm("District")} rules={req}>
                <Input maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="street" label={tForm("Street")} rules={req}>
                <Input maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item
                name="buildingNo"
                label={tForm("BuildingNo")}
                rules={[...req, ...digits(/^\d{4}$/, "BuildingNoInvalid")]}
              >
                <Input inputMode="numeric" maxLength={4} />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item
                name="additionalNo"
                label={tForm("AdditionalNo")}
                rules={digits(/^\d{4}$/, "AdditionalNoInvalid")}
              >
                <Input inputMode="numeric" maxLength={4} />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item
                name="postalCode"
                label={tForm("PostalCode")}
                rules={[...req, ...digits(/^\d{5}$/, "PostalCodeInvalid")]}
              >
                <Input inputMode="numeric" maxLength={5} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

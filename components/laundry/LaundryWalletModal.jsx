"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import { PlusOutlined, StopOutlined, WalletOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useCan } from "@/components/auth/AuthProvider";
import { useSaveKey } from "@/components/common/useSaveKey";
import PrintDocument from "@/components/printing/PrintDocument";
import {
  cancelLaundryWalletAction,
  createLaundryWalletAction,
  customerWalletsAction,
} from "@/actions/laundry-order.actions";
import { applyFieldErrors } from "@/lib/form-errors";
import { formatDateTime, formatDay } from "@/lib/dates";
import { saleDocNo } from "@/lib/doc-number";
import { C } from "@/lib/theme";
import LaundryWalletReceipt from "./LaundryWalletReceipt";
import QuickAddParty from "@/components/parties/QuickAddParty";
import "@/components/common/table.css";

const STATUS_COLOR = {
  active: C.success,
  used: C.muted,
  expired: C.warning,
  cancelled: C.danger,
};

// ============================================================
// اشتراكات العميل (من الكاشير): الرصيد + الاشتراكات وصرفها + اشتراك جديد
// - العميل: بيبدأ بعميل السلة، ويتغير من النافذة نفسها (بحث بالجوال / الكود / الاسم)
//   أو عميل جديد ببياناته كاملة (زرار جنب البحث)
//   ولو جوال السلة مش مسجل: الاشتراك بيسجله (بالاسم)
// - اشتراك جديد: المدفوع + المشحون (المكافأة = الفرق) + طريقة الدفع
//   ← سند قبض بيدخل الدرج + إيصال الاشتراك بيتطبع
// onChanged(balance): الرصيد اتغير (يتحدث في رأس السلة)
// ============================================================
export default function LaundryWalletModal({
  // عميل السلة (البداية)
  customerId: cartCustomerId,
  phone: cartPhone,
  customerName,
  // كل العملاء (للبحث)
  customers = [],
  methods,
  printSettings,
  onClose,
  onChanged,
}) {
  const t = useTranslations("Laundry");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const can = useCan();
  const { amount: money } = useCurrency();
  const saveKey = useSaveKey();
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  const [data, setData] = useState(null);
  // العميل المختار في النافذة (+ اللي اتضافوا دلوقتي)
  const [customerId, setCustomerId] = useState(cartCustomerId ?? null);
  const [added, setAdded] = useState([]);
  const list = useMemo(
    () => [
      ...customers,
      ...added.filter((a) => !customers.some((c) => c.id === a.id)),
    ],
    [customers, added],
  );
  const picked = list.find((c) => c.id === customerId) ?? null;
  // الجوال: من بيانات العميل، أو جوال السلة (عميل مش مسجل)
  const phone = customerId
    ? (data?.customer?.phone ?? picked?.phone ?? (customerId === cartCustomerId ? cartPhone : ""))
    : cartPhone;
  const customerArName = data?.customer?.arName ?? picked?.arName ?? null;
  const [adding, setAdding] = useState(!cartCustomerId);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(null);
  const [form] = Form.useForm();
  const paid = Form.useWatch("paidAmount", form) ?? 0;
  const credit = Form.useWatch("creditAmount", form) ?? 0;

  const load = useCallback(async () => {
    if (!customerId) return;
    const res = await customerWalletsAction(customerId);
    if (!res.success) return showActionError(res, tAlerts, locale);
    setData(res.data);
  }, [customerId, tAlerts, locale]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const cash = methods.find((m) => m.type === "cash") ?? methods[0];
  // الاشتراك لازم باسم العميل: الجديد أو المسجل بالجوال بس
  const needName =
    !customerId || !customerArName || customerArName === phone;

  const choose = (id) => {
    setCustomerId(id ?? null);
    setData(null);
    setAdding(false);
  };

  const create = async (v) => {
    setSaving(true);
    const res = await saveKey.send(createLaundryWalletAction, {
      customerId: customerId ?? null,
      phone,
      customerName: needName ? v.customerName?.trim() || null : null,
      paidAmount: v.paidAmount,
      creditAmount: v.creditAmount,
      paymentMethodId: v.paymentMethodId,
      reference: v.reference || null,
      notes: v.notes || null,
    });
    setSaving(false);
    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      return showActionError(res, tAlerts, locale);
    }
    message.success(t("WalletCreatedN", { n: res.data.number }));
    setPrinting(res.data);
    setAdding(false);
    form.resetFields();
    onChanged?.(res.data.balance, res.data.customer);
    // العميل اتسجل مع الاشتراك ← بقى هو المختار
    if (!customerId) {
      setAdded((prev) => [...prev, res.data.customer]);
      setCustomerId(res.data.customer.id);
    } else load();
  };

  const cancel = async (w) => {
    const res = await cancelLaundryWalletAction(w.id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("WalletCancelled"));
    await load();
    // الرصيد بعد الإلغاء
    const after = await customerWalletsAction(customerId);
    if (after.success) onChanged?.(after.data.balance, after.data.customer);
  };

  const paper = printSettings?.paperSize === "58mm" ? "58mm" : "80mm";

  return (
    <Modal
      open
      width={860}
      footer={null}
      onCancel={onClose}
      title={
        <span>
          <WalletOutlined /> {t("Subscriptions")}
        </span>
      }
      destroyOnHidden
    >
      {/* العميل: بحث بالجوال أو الكود أو الاسم + عميل جديد */}
      <Space.Compact style={{ width: "100%" }} className="mb-3">
        <Select
          showSearch
          allowClear
          optionFilterProp="label"
          placeholder={t("PickCustomer")}
          style={{ width: "100%" }}
          value={customerId ?? undefined}
          onChange={choose}
          options={list.map((c) => ({
            value: c.id,
            label: `${c.code} - ${nm(c)}${c.phone ? ` (${c.phone})` : ""}`,
          }))}
        />
        <QuickAddParty
          kind="customers"
          onCreated={(c) => {
            setAdded((prev) => [...prev, c]);
            choose(c.id);
            setAdding(true);
          }}
        />
      </Space.Compact>
      {/* الاشتراك لازم بجوال العميل */}
      {customerId && data && !phone && (
        <Alert type="warning" showIcon className="mb-3" title={t("WalletNeedsPhone")} />
      )}
      {!customerId && !cartPhone && (
        <Alert type="info" showIcon className="mb-3" title={t("WalletPickCustomerHint")} />
      )}
      {customerId && data && (
        <div className="lp-wallet-balance">
          <span>{t("WalletBalance")}</span>
          <b>
            <bdi>{money(data.balance)}</bdi>
          </b>
        </div>
      )}

      {can("laundrySubscriptions.create") &&
        Boolean(phone) &&
        (adding ? (
          <div className="lp-wallet-form">
            {!customerId && (
              <Alert
                type="info"
                showIcon
                className="mb-3"
                title={t("WalletNewCustomerHint", { phone })}
              />
            )}
            <Form
              form={form}
              layout="vertical"
              autoComplete="off"
              onFinish={create}
              initialValues={{
                paymentMethodId: cash?.id,
                customerName: customerName || "",
              }}
            >
              <Row gutter={12}>
                {needName && (
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="customerName"
                      label={t("NewCustomerName")}
                      tooltip={t("WalletNameHint")}
                      rules={[
                        { required: true, whitespace: true, message: tAlerts("RequiredField") },
                        { min: 3, message: tAlerts("MinCharcters") },
                      ]}
                    >
                      <Input autoComplete="off" maxLength={255} />
                    </Form.Item>
                  </Col>
                )}
                <Col xs={12} md={6}>
                  <Form.Item
                    name="paidAmount"
                    label={t("WalletPaid")}
                    rules={[{ required: true, message: tAlerts("RequiredField") }]}
                  >
                    <InputNumber
                      autoFocus
                      min={0.01}
                      precision={2}
                      style={{ width: "100%" }}
                      onChange={(v) => {
                        // المشحون الافتراضي = المدفوع (لو لسه ما اتكتبش أكبر)
                        if (!(form.getFieldValue("creditAmount") > (v ?? 0)))
                          form.setFieldValue("creditAmount", v);
                      }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item
                    name="creditAmount"
                    label={t("WalletCredit")}
                    tooltip={t("WalletCreditHint")}
                    rules={[{ required: true, message: tAlerts("RequiredField") }]}
                  >
                    <InputNumber min={0.01} precision={2} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="paymentMethodId"
                    label={t("PaymentMethod")}
                    rules={[{ required: true, message: tAlerts("RequiredField") }]}
                  >
                    <Select
                      options={methods.map((m) => ({ value: m.id, label: nm(m) }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="reference" label={t("WalletReference")}>
                    <Input autoComplete="off" maxLength={100} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="notes" label={t("Notes")}>
                    <Input autoComplete="off" maxLength={255} />
                  </Form.Item>
                </Col>
              </Row>
              {/* المكافأة بسرعة: % من المدفوع */}
              <Space wrap className="mb-3">
                <span style={{ color: C.muted }}>{t("WalletBonusQuick")}</span>
                {[10, 20, 30, 50].map((p) => (
                  <Button
                    key={p}
                    size="small"
                    disabled={!(paid > 0)}
                    onClick={() =>
                      form.setFieldValue(
                        "creditAmount",
                        Math.round(paid * (100 + p)) / 100,
                      )
                    }
                  >
                    +{p}%
                  </Button>
                ))}
                {credit > paid && paid > 0 && (
                  <Tag color={C.success}>
                    {t("WalletBonusN", { n: money(credit - paid) })}
                  </Tag>
                )}
              </Space>
              <Space>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<PlusOutlined />}
                  loading={saving}
                >
                  {t("WalletSave")}
                </Button>
                {customerId && (
                  <Button onClick={() => setAdding(false)}>{t("Cancel")}</Button>
                )}
              </Space>
            </Form>
          </div>
        ) : (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            className="mb-3"
            onClick={() => setAdding(true)}
          >
            {t("NewWallet")}
          </Button>
        ))}

      {customerId &&
        (data?.wallets?.length ? (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={data.wallets}
            scroll={{ x: 760 }}
            expandable={{
              rowExpandable: (w) => w.uses.length > 0,
              expandedRowRender: (w) => (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={w.uses}
                  columns={[
                    {
                      title: t("Invoice"),
                      render: (_, u) => (
                        <bdi>{saleDocNo(u.sale.type, u.sale.number)}</bdi>
                      ),
                    },
                    {
                      title: t("Date"),
                      render: (_, u) => <bdi>{formatDateTime(u.createdAt)}</bdi>,
                    },
                    {
                      title: t("WalletUsed"),
                      render: (_, u) => <bdi>{money(u.credit)}</bdi>,
                    },
                    {
                      title: t("WalletBonusPart"),
                      render: (_, u) => <bdi>{money(u.bonus)}</bdi>,
                    },
                  ]}
                />
              ),
            }}
            columns={[
              {
                title: t("WalletNo"),
                width: 90,
                render: (_, w) => <bdi>LW-{w.number}</bdi>,
              },
              {
                title: t("Date"),
                width: 150,
                render: (_, w) => <bdi>{formatDateTime(w.createdAt)}</bdi>,
              },
              {
                title: t("WalletPaid"),
                render: (_, w) => <bdi>{money(w.paidAmount)}</bdi>,
              },
              {
                title: t("WalletCredit"),
                render: (_, w) => <bdi>{money(w.creditAmount)}</bdi>,
              },
              {
                title: t("WalletRemaining"),
                render: (_, w) => (
                  <b>
                    <bdi>{money(w.remaining)}</bdi>
                  </b>
                ),
              },
              {
                title: t("WalletExpires"),
                render: (_, w) =>
                  w.expiresAt ? <bdi>{formatDay(w.expiresAt)}</bdi> : "—",
              },
              {
                title: t("Status"),
                render: (_, w) => (
                  <Tag color={STATUS_COLOR[w.status]}>
                    {t(`WalletStatus_${w.status}`)}
                  </Tag>
                ),
              },
              {
                title: "",
                width: 60,
                render: (_, w) =>
                  can("laundrySubscriptions.cancel") &&
                  w.status === "active" &&
                  !w.uses.length && (
                    <Popconfirm
                      title={t("WalletCancelConfirm")}
                      okButtonProps={{ danger: true }}
                      onConfirm={() => cancel(w)}
                    >
                      <Button
                        type="text"
                        danger
                        icon={<StopOutlined />}
                        aria-label={t("WalletCancel")}
                        title={t("WalletCancel")}
                      />
                    </Popconfirm>
                  ),
              },
            ]}
          />
        ) : (
          data && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("NoWallets")}
            />
          )
        ))}

      {printing && (
        <PrintDocument paperSize={paper} onDone={() => setPrinting(null)}>
          <LaundryWalletReceipt
            wallet={printing}
            phone={phone}
            paperSize={paper}
            lang={printSettings?.language ?? "both"}
          />
        </PrintDocument>
      )}
    </Modal>
  );
}

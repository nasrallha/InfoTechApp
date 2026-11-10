"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
} from "antd";
import {
  ArrowRightOutlined,
  FileTextOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { formatDate, today } from "@/lib/dates";
import {
  createVoucherAction,
  getPartyAccountAction,
  updateVoucherAction,
} from "@/actions/account.actions";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useSaveKey } from "@/components/common/useSaveKey";
import { useCurrency } from "@/components/common/CurrencyProvider";
import NextDocNo from "@/components/common/NextDocNo";
import DayPicker from "@/components/common/DayPicker";
import QuickAddParty from "@/components/parties/QuickAddParty";
import { formatDocNo, purchaseDocHref, saleDocHref } from "@/lib/doc-number";
import PrintActions from "@/components/printing/PrintActions";
import VoucherDocument from "./VoucherDocument";
import { VOUCHER_COLOR, VOUCHER_PARTIES, VOUCHER_PATH } from "./voucherConfig";
import { C } from "@/lib/theme";

const EPS = 0.0001;

// ============================================================
// سند جديد (أو تعديل سند: voucher): قبض / صرف / تسوية
// - التعديل: نفس النوع والرقم، والرصيد والفواتير بتظهر كأن السند مش موجود
// - العميل/المورد: يظهر رصيده وفواتيره المفتوحة، والمبلغ لا يتجاوز الرصيد
//   والسند يسدد من الأقدم تلقائياً (يظهر توزيعه قبل الحفظ)
// - التسوية: بدون طريقة دفع (خصم مسموح به / مكتسب)
// ============================================================
export default function VoucherForm({
  type,
  options,
  preset,
  voucher = null,
  canChangeDate,
  printSettings,
}) {
  const [form] = Form.useForm();
  const router = useRouter();
  const isEdit = Boolean(voucher);
  const locale = useLocale();
  const t = useTranslations("Accounts");
  const tAlerts = useTranslations("Alerts");
  const { amount: money, symbol, decimals } = useCurrency();
  // بصمة الحفظ: الضغط على حفظ مرتين (أو بعد ما الرد يضيع) مايكررش المستند
  const saveKey = useSaveKey();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  const parties = VOUCHER_PARTIES[type];
  const initialParty = voucher
    ? voucher.partyType
    : preset?.supplierId
      ? "supplier"
      : preset?.customerId
        ? "customer"
        : parties[0];
  const [partyType, setPartyType] = useState(
    parties.includes(initialParty) ? initialParty : parties[0],
  );
  const [account, setAccount] = useState(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  // العملاء/الموردين اللي اتضافوا من الزر السريع
  const [added, setAdded] = useState({ customers: [], suppliers: [] });
  const withAdded = (list, kind) => [
    ...list,
    ...added[kind].filter((a) => !list.some((p) => p.id === a.id)),
  ];
  const onPartyCreated = (kind, field) => (p) => {
    setAdded((prev) => ({ ...prev, [kind]: [...prev[kind], p] }));
    form.setFieldValue(field, p.id);
  };
  const isSettlement = type === "settlement";
  const isParty = partyType === "customer" || partyType === "supplier";

  const partyId = Form.useWatch(
    partyType === "customer" ? "customerId" : "supplierId",
    form,
  );
  const amount = Form.useWatch("amount", form) ?? 0;
  const methodId = Form.useWatch("paymentMethodId", form);
  const method = options.methods.find((m) => m.id === methodId);

  // رصيد الطرف وفواتيره المفتوحة
  useEffect(() => {
    if (!isParty || !partyId) {
      setAccount(null);
      return;
    }
    let alive = true;
    setLoadingAccount(true);
    getPartyAccountAction({
      kind: partyType,
      id: partyId,
      // التعديل: الرصيد والفواتير من غير السند ده
      excludeVoucherId: voucher?.id ?? null,
    }).then((res) => {
      if (!alive) return;
      setLoadingAccount(false);
      if (res.success) setAccount(res.data);
      else showActionError(res, tAlerts, locale);
    });
    return () => {
      alive = false;
    };
  }, [isParty, partyType, partyId, savedCount, tAlerts, locale, voucher?.id]);

  const balance = account?.balance ?? 0;
  // القبض من عميل: مسموح أكثر من مديونيته (الزيادة تبقى رصيد له عندنا)
  const allowAdvance = type === "receipt" && partyType === "customer";
  const maxAmount = isParty && !allowAdvance ? Math.max(balance, 0) : undefined;
  const after = balance - (amount || 0);
  // آخر سند اتحفظ (يُطبع في نفس الشاشة)
  const [lastVoucher, setLastVoucher] = useState(null);

  // التوزيع المتوقع على الأقدم
  const allocation = useMemo(() => {
    if (!account || !(amount > 0)) return [];
    const rows = [];
    let rest = amount;
    if (account.opening > EPS) {
      const a = Math.min(account.opening, rest);
      rows.push({
        key: "opening",
        label: t("OpeningBalance"),
        open: account.opening,
        paid: a,
      });
      rest -= a;
    }
    for (const inv of account.invoices) {
      if (rest <= EPS) break;
      const a = Math.min(inv.open, rest);
      rows.push({
        key: inv.id,
        label: inv.docNo,
        date: inv.date,
        open: inv.open,
        paid: a,
      });
      rest -= a;
    }
    return rows;
  }, [account, amount, t]);

  const reset = () => {
    form.resetFields();
    setAccount(null);
  };

  const submit = async (values) => {
    if (isParty && !allowAdvance && values.amount > maxAmount + EPS) {
      form.setFields([
        { name: "amount", errors: [tAlerts("AmountExceedsBalance")] },
      ]);
      return;
    }
    setSaving(true);
    const payload = {
      type,
      partyType,
      customerId: partyType === "customer" ? values.customerId : null,
      supplierId: partyType === "supplier" ? values.supplierId : null,
      expenseCategoryId:
        partyType === "expense" ? values.expenseCategoryId : null,
      partyName: partyType === "other" ? values.partyName : null,
      paymentMethodId: isSettlement ? null : values.paymentMethodId,
      amount: values.amount,
      reference: values.reference,
      date: canChangeDate ? values.date : undefined,
      notes: values.notes,
    };
    const res = isEdit
      ? await updateVoucherAction({ ...payload, id: voucher.id })
      : await saveKey.send(createVoucherAction, payload);
    setSaving(false);
    if (!res.success) {
      if (res.fieldErrors) {
        form.setFields(
          Object.entries(res.fieldErrors).map(([name, code]) => ({
            name,
            errors: [tAlerts(code)],
          })),
        );
      }
      if (
        res.error === "AmountExceedsBalance" &&
        res.details?.balance != null
      ) {
        message.error(
          `${tAlerts("AmountExceedsBalance")} (${money(res.details.balance)} ${symbol})`,
        );
        setSavedCount((c) => c + 1);
        return;
      }
      return showActionError(res, tAlerts, locale);
    }
    message.success(t("VoucherSaved"));
    // التعديل: نرجع لصفحة السند
    if (isEdit) {
      router.replace(`/accounts/vouchers/${voucher.id}`);
      router.refresh();
      return;
    }
    reset();
    setSavedCount((c) => c + 1);
    // الطباعة هنا مباشرة (بالمقاس الافتراضي) والسند جاهز لسند جديد
    setLastVoucher(res.data);
  };

  const partyOptions = (list) =>
    list.map((p) => ({
      value: p.id,
      label: `${p.code} - ${nameOf(p)}`,
      search:
        `${p.code} ${p.arName} ${p.enName} ${p.phone ?? ""}`.toLowerCase(),
    }));

  const invoiceColumns = [
    {
      title: t("InvoiceNo"),
      dataIndex: "docNo",
      width: 100,
      render: (v, r) => (
        <Link
          href={
            partyType === "customer"
              ? saleDocHref(r.type, r.id)
              : purchaseDocHref(r.type, r.id)
          }
          target="_blank"
        >
          <bdi>{v}</bdi>
        </Link>
      ),
    },
    {
      title: t("Date"),
      dataIndex: "date",
      width: 100,
      render: (v) => <bdi>{formatDate(v)}</bdi>,
    },
    {
      title: t("InvoiceTotal"),
      dataIndex: "total",
      width: 100,
      align: "end",
      render: money,
    },
    {
      title: t("PaidSettled"),
      key: "ps",
      width: 110,
      align: "end",
      render: (_, r) => money(r.total - r.open),
    },
    {
      title: t("OpenAmount"),
      dataIndex: "open",
      width: 100,
      align: "end",
      render: (v) => <b>{money(v)}</b>,
    },
  ];

  const color = VOUCHER_COLOR[type];

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <Space wrap>
          <Link href={VOUCHER_PATH[type]}>
            <Button
              icon={
                <ArrowRightOutlined className="rtl:rotate-0 ltr:rotate-180" />
              }
            />
          </Link>
          <h1 className="font-bold text-xl" style={{ color }}>
            {isEdit ? (
              <>
                {t("EditVoucher")}{" "}
                <bdi>{formatDocNo(voucher.type, voucher.number)}</bdi>
              </>
            ) : (
              t(`new.${type}`)
            )}
          </h1>
          {!isEdit && <NextDocNo type={type} refreshKey={savedCount} />}
        </Space>
        {isParty && partyId && (
          <Link
            href={`/accounts/statements?kind=${partyType}&id=${partyId}`}
            target="_blank"
          >
            <Button icon={<FileTextOutlined />}>{t("Statement")}</Button>
          </Link>
        )}
      </div>

      {lastVoucher && (
        <Alert
          className="mb-3"
          type="success"
          showIcon
          closable
          onClose={() => setLastVoucher(null)}
          title={t("LastVoucherSaved", {
            number: formatDocNo(lastVoucher.type, lastVoucher.number),
          })}
          action={
            <Space wrap>
              <PrintActions
                key={lastVoucher.id}
                autoPrint
                keepUrl
                size="small"
                defaultPaper={printSettings?.paperSize ?? "80mm"}
                fileName={formatDocNo(lastVoucher.type, lastVoucher.number)}
                renderDoc={(paper) => (
                  <VoucherDocument
                    voucher={lastVoucher}
                    paperSize={paper}
                    lang={printSettings?.language ?? "both"}
                  />
                )}
              />
              <Link href={`/accounts/vouchers/${lastVoucher.id}`}>
                <Button size="small">{t("View")}</Button>
              </Link>
            </Space>
          }
        />
      )}

      {isSettlement && (
        <Alert
          className="mb-3"
          type="info"
          showIcon
          title={t(`settlementHint.${partyType}`)}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={11}>
          <Card>
            <Form
              form={form}
              layout="vertical"
              onFinish={submit}
              initialValues={
                voucher
                  ? {
                      customerId: voucher.customerId ?? undefined,
                      supplierId: voucher.supplierId ?? undefined,
                      expenseCategoryId: voucher.expenseCategoryId ?? undefined,
                      partyName:
                        voucher.partyType === "other"
                          ? voucher.partyArName
                          : undefined,
                      paymentMethodId: voucher.paymentMethodId ?? undefined,
                      amount: voucher.amount,
                      reference: voucher.reference ?? undefined,
                      notes: voucher.notes ?? undefined,
                      date: voucher.dayOfDate,
                    }
                  : {
                      customerId: preset?.customerId ?? undefined,
                      supplierId: preset?.supplierId ?? undefined,
                      date: today(),
                    }
              }
            >
              <Form.Item label={t("PartyType")}>
                <Segmented
                  block
                  value={partyType}
                  onChange={(v) => {
                    setPartyType(v);
                    setAccount(null);
                  }}
                  options={parties.map((p) => ({
                    value: p,
                    label: t(`party.${type}.${p}`),
                  }))}
                />
              </Form.Item>

              {partyType === "customer" && (
                <Form.Item label={t("Customer")} required>
                  <Space.Compact style={{ width: "100%" }}>
                    <Form.Item
                      name="customerId"
                      noStyle
                      rules={[
                        { required: true, message: tAlerts("RequiredField") },
                      ]}
                    >
                      <Select
                        showSearch
                        size="large"
                        style={{ width: "100%" }}
                        placeholder={t("ChooseCustomer")}
                        options={partyOptions(
                          withAdded(options.customers, "customers"),
                        )}
                        filterOption={(input, o) =>
                          o.search.includes(input.toLowerCase())
                        }
                      />
                    </Form.Item>
                    <QuickAddParty
                      kind="customers"
                      size="large"
                      onCreated={onPartyCreated("customers", "customerId")}
                    />
                  </Space.Compact>
                </Form.Item>
              )}
              {partyType === "supplier" && (
                <Form.Item label={t("Supplier")} required>
                  <Space.Compact style={{ width: "100%" }}>
                    <Form.Item
                      name="supplierId"
                      noStyle
                      rules={[
                        { required: true, message: tAlerts("RequiredField") },
                      ]}
                    >
                      <Select
                        showSearch
                        size="large"
                        style={{ width: "100%" }}
                        placeholder={t("ChooseSupplier")}
                        options={partyOptions(
                          withAdded(options.suppliers, "suppliers"),
                        )}
                        filterOption={(input, o) =>
                          o.search.includes(input.toLowerCase())
                        }
                      />
                    </Form.Item>
                    <QuickAddParty
                      kind="suppliers"
                      size="large"
                      onCreated={onPartyCreated("suppliers", "supplierId")}
                    />
                  </Space.Compact>
                </Form.Item>
              )}
              {partyType === "expense" && (
                <Form.Item
                  name="expenseCategoryId"
                  label={t("ExpenseCategory")}
                  rules={[
                    { required: true, message: tAlerts("RequiredField") },
                  ]}
                >
                  <Select
                    showSearch
                    size="large"
                    optionFilterProp="label"
                    options={options.categories.map((c) => ({
                      value: c.id,
                      label: nameOf(c),
                    }))}
                  />
                </Form.Item>
              )}
              {partyType === "other" && (
                <Form.Item
                  name="partyName"
                  label={t("ReceivedFrom")}
                  rules={[
                    { required: true, message: tAlerts("RequiredField") },
                  ]}
                >
                  <Input size="large" maxLength={255} />
                </Form.Item>
              )}

              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="amount"
                    label={`${t("Amount")} (${symbol})`}
                    rules={[
                      { required: true, message: tAlerts("RequiredField") },
                    ]}
                    extra={
                      isParty && account
                        ? allowAdvance
                          ? amount > balance + EPS
                            ? t("AdvanceHint", {
                                amount: money(amount - Math.max(balance, 0)),
                              })
                            : undefined
                          : `${t("MaxAmount")}: ${money(maxAmount)}`
                        : undefined
                    }
                  >
                    <InputNumber
                      size="large"
                      style={{ width: "100%" }}
                      min={0}
                      max={maxAmount}
                      precision={decimals}
                      disabled={
                        isParty &&
                        (!account || (!allowAdvance && maxAmount <= EPS))
                      }
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="date" label={t("Date")}>
                    <DayPicker
                      size="large"
                      max={today()}
                      disabled={!canChangeDate}
                    />
                  </Form.Item>
                </Col>
              </Row>

              {!isSettlement && (
                <Row gutter={12}>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      name="paymentMethodId"
                      label={t("PaymentMethod")}
                      rules={[
                        { required: true, message: tAlerts("RequiredField") },
                      ]}
                    >
                      <Select
                        size="large"
                        options={options.methods.map((m) => ({
                          value: m.id,
                          label: nameOf(m),
                        }))}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      name="reference"
                      label={t("Reference")}
                      rules={[
                        {
                          required: Boolean(method?.requiresReference),
                          message: tAlerts("ReferenceRequired"),
                        },
                      ]}
                    >
                      <Input size="large" maxLength={100} />
                    </Form.Item>
                  </Col>
                </Row>
              )}

              <Form.Item name="notes" label={t("Notes")}>
                <Input.TextArea rows={2} maxLength={500} />
              </Form.Item>

              <Button
                type="primary"
                htmlType="submit"
                size="large"
                block
                loading={saving}
                icon={<SaveOutlined />}
              >
                {isEdit ? t("SaveChanges") : t("SaveAndPrint")}
              </Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={13}>
          {isParty ? (
            <Card loading={loadingAccount} title={t("PartyAccount")}>
              {!account ? (
                <Empty
                  description={t(
                    partyType === "customer"
                      ? "ChooseCustomer"
                      : "ChooseSupplier",
                  )}
                />
              ) : (
                <>
                  <Row gutter={12} className="mb-3">
                    <Col xs={24} sm={8}>
                      <Statistic
                        title={
                          balance < -EPS
                            ? t(`creditBalance.${partyType}`)
                            : t(
                                partyType === "customer"
                                  ? "CustomerOwes"
                                  : "WeOwe",
                              )
                        }
                        value={money(Math.abs(balance))}
                        styles={{
                          content: {
                            color: balance > 0 ? C.dangerText : C.successText,
                            fontWeight: 700,
                          },
                        }}
                      />
                    </Col>
                    <Col xs={24} sm={8}>
                      <Statistic
                        title={t("ThisVoucher")}
                        value={money(amount || 0)}
                      />
                    </Col>
                    <Col xs={24} sm={8}>
                      <Statistic
                        title={
                          after < -EPS
                            ? `${t("BalanceAfter")} (${t(`creditBalance.${partyType}`)})`
                            : t("BalanceAfter")
                        }
                        value={money(Math.abs(after))}
                        styles={{ content: { fontWeight: 700 } }}
                      />
                    </Col>
                  </Row>
                  {balance <= EPS && !allowAdvance && (
                    <Alert
                      type="success"
                      showIcon
                      className="mb-3"
                      title={t("NoBalance")}
                    />
                  )}
                  {account.opening > EPS && (
                    <div className="mb-2">
                      <Tag color="purple">
                        {t("OpeningBalance")}: {money(account.opening)}
                      </Tag>
                    </div>
                  )}
                  <h4 className="font-bold mb-2">{t("OpenInvoices")}</h4>
                  <Table
                    size="small"
                    bordered
                    rowKey="id"
                    columns={invoiceColumns}
                    dataSource={account.invoices}
                    pagination={
                      account.invoices.length > 8 ? { pageSize: 8 } : false
                    }
                    scroll={{ x: 510 }}
                  />
                  {allocation.length > 0 && (
                    <>
                      <h4 className="font-bold mt-3 mb-2">
                        {t("AllocationPreview")}
                      </h4>
                      <Table
                        size="small"
                        bordered
                        rowKey="key"
                        pagination={false}
                        dataSource={allocation}
                        columns={[
                          {
                            title: t("Item"),
                            dataIndex: "label",
                            render: (v) => <bdi>{v}</bdi>,
                          },
                          {
                            title: t("OpenAmount"),
                            dataIndex: "open",
                            align: "end",
                            render: money,
                          },
                          {
                            title: t("Allocated"),
                            dataIndex: "paid",
                            align: "end",
                            render: (v) => <b>{money(v)}</b>,
                          },
                          {
                            title: t("RemainingOnIt"),
                            key: "rest",
                            align: "end",
                            render: (_, r) =>
                              money(Math.max(r.open - r.paid, 0)),
                          },
                        ]}
                      />
                    </>
                  )}
                </>
              )}
            </Card>
          ) : (
            <Card>
              <Empty
                description={t(
                  partyType === "expense" ? "ExpenseHint" : "OtherIncomeHint",
                )}
              />
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}

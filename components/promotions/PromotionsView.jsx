"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  TreeSelect,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  GiftOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { formatDay, today } from "@/lib/dates";
import {
  deletePromotionAction,
  savePromotionAction,
  togglePromotionAction,
} from "@/actions/promotion.actions";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useCan } from "@/components/auth/AuthProvider";
import DayPicker from "@/components/common/DayPicker";
import { listSep } from "@/lib/list-sep";
import "@/components/common/table.css";

const SCOPE_COLOR = {
  invoice: "purple",
  category: "blue",
  product: "cyan",
  loyalty: "magenta",
};
const STATUS_COLOR = {
  running: "green",
  scheduled: "gold",
  expired: "default",
  stopped: "red",
};

// حالة العرض النهارده
const statusOf = (p, day) =>
  !p.isActive
    ? "stopped"
    : day < p.startDate
      ? "scheduled"
      : day > p.endDate
        ? "expired"
        : "running";

// ============================================================
// العروض والخصومات لفترة: القائمة + إضافة / تعديل / تفعيل / إيقاف / حذف
// ============================================================
export default function PromotionsView({ promotions, options }) {
  const [form] = Form.useForm();
  const [editing, setEditing] = useState(null); // null | {} | promo
  const [saving, setSaving] = useState(false);
  const locale = useLocale();
  const t = useTranslations("Promotions");
  const tTable = useTranslations("Table");
  const tAlerts = useTranslations("Alerts");
  const can = useCan();
  const { amount: money, symbol, decimals } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const day = today();

  const scope = Form.useWatch("scope", form);
  // عرض الولاء: على إيه (كل الخدمات / أقسام / أصناف)
  const loyaltyTarget = Form.useWatch("loyaltyTarget", form);
  const isLoyalty = scope === "loyalty";
  const pick = isLoyalty ? loyaltyTarget : scope;
  const discountType = Form.useWatch("discountType", form);
  const allBranches = Form.useWatch("allBranches", form);

  const productOptions = useMemo(
    () =>
      options.products.map((p) => ({
        value: p.id,
        label: `${p.code} - ${nm(p)}`,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.products, locale],
  );
  const categoryTree = useMemo(
    () =>
      options.categories.map((c) => ({
        value: c.id,
        title: nm(c),
        children: c.children.map((ch) => ({ value: ch.id, title: nm(ch) })),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.categories, locale],
  );
  const catName = (id) => {
    for (const c of options.categories) {
      if (c.id === id) return nm(c);
      const ch = c.children.find((x) => x.id === id);
      if (ch) return nm(ch);
    }
    return "";
  };

  const open = (p) => {
    setEditing(p ?? {});
    form.resetFields();
    form.setFieldsValue(
      p
        ? {
            ...p,
            minInvoice: p.minInvoice ?? undefined,
            loyaltyEvery: p.loyaltyEvery ?? undefined,
            loyaltyTarget: p.loyaltyTarget ?? "service",
          }
        : {
            arName: "",
            enName: "",
            scope: "category",
            discountType: "percent",
            value: undefined,
            startDate: day,
            endDate: day,
            isActive: can("promotions.activate"),
            allBranches: true,
            branchIds: [],
            categoryIds: [],
            productIds: [],
          },
    );
  };

  const save = async (values) => {
    setSaving(true);
    const res = await savePromotionAction({
      ...values,
      ...(editing?.id ? { id: editing.id } : {}),
      minInvoice: values.minInvoice ?? null,
      ...(values.scope === "loyalty"
        ? {
            discountType: "percent",
            loyaltyEvery: values.loyaltyEvery ?? null,
            loyaltyTarget: values.loyaltyTarget ?? "service",
          }
        : { loyaltyEvery: null, loyaltyTarget: null }),
      branchIds: values.branchIds ?? [],
      categoryIds: values.categoryIds ?? [],
      productIds: values.productIds ?? [],
    });
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
      return showActionError(res, tAlerts, locale);
    }
    message.success(t("Saved"));
    setEditing(null);
  };

  const toggle = async (p, isActive) => {
    const res = await togglePromotionAction({ id: p.id, isActive });
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(isActive ? t("Activated") : t("Stopped"));
  };

  const remove = async (p) => {
    const res = await deletePromotionAction(p.id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Deleted"));
  };

  const valueText = (p) =>
    p.discountType === "percent"
      ? `${p.value}%`
      : p.discountType === "fixedPrice"
        ? `${t("FixedPriceShort")} ${money(p.value)} ${symbol}`
        : `${money(p.value)} ${symbol}`;

  const loyaltyText = (p) =>
    `${t("LoyaltyEveryText", { n: p.loyaltyEvery ?? 0 })} — ${
      p.loyaltyTarget === "service"
        ? t("LoyaltyAllServices")
        : p.loyaltyTarget === "category"
          ? p.categoryIds.map(catName).join(listSep(locale))
          : t("ProductsCount", { count: p.productIds.length })
    }`;

  const targetText = (p) =>
    p.scope === "loyalty"
      ? loyaltyText(p)
      : p.scope === "invoice"
        ? p.minInvoice
          ? `${t("MinInvoice")}: ${money(p.minInvoice)}`
          : t("AllInvoices")
        : p.scope === "category"
          ? p.categoryIds.map(catName).join(listSep(locale))
          : t("ProductsCount", { count: p.productIds.length });

  const columns = [
    {
      title: t("Name"),
      key: "name",
      width: 200,
      render: (_, p) => <b>{nm(p)}</b>,
    },
    {
      title: t("Scope"),
      key: "scope",
      width: 120,
      align: "center",
      render: (_, p) => (
        <Tag color={SCOPE_COLOR[p.scope]}>{t(`scopes.${p.scope}`)}</Tag>
      ),
    },
    {
      title: t("Discount"),
      key: "value",
      width: 130,
      align: "center",
      render: (_, p) => <b>{valueText(p)}</b>,
    },
    {
      title: t("AppliesTo"),
      key: "target",
      width: 220,
      ellipsis: true,
      render: (_, p) => targetText(p),
    },
    {
      title: t("Period"),
      key: "period",
      width: 190,
      align: "center",
      render: (_, p) => (
        <bdi>
          {formatDay(p.startDate)} → {formatDay(p.endDate)}
        </bdi>
      ),
    },
    {
      title: t("Branches"),
      key: "branches",
      width: 150,
      ellipsis: true,
      render: (_, p) =>
        p.allBranches
          ? t("AllBranches")
          : p.branchIds
              .map((id) => nm(options.branches.find((b) => b.id === id)))
              .join(listSep(locale)),
    },
    {
      title: tTable("Status"),
      key: "status",
      width: 170,
      align: "center",
      render: (_, p) => {
        const st = statusOf(p, day);
        return (
          <Space>
            <Tag color={STATUS_COLOR[st]}>{t(`status.${st}`)}</Tag>
            {can("promotions.activate") && (
              <Switch
                size="small"
                checked={p.isActive}
                onChange={(v) => toggle(p, v)}
              />
            )}
          </Space>
        );
      },
    },
    {
      title: t("UsedIn"),
      key: "used",
      width: 90,
      align: "center",
      render: (_, p) => p.usedCount,
    },
    {
      title: tTable("Actions"),
      key: "actions",
      width: 100,
      align: "center",
      render: (_, p) => (
        <Space>
          {can("promotions.update") && (
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => open(p)}
            />
          )}
          {can("promotions.delete") && (
            <Popconfirm
              title={t("DeleteConfirm")}
              onConfirm={() => remove(p)}
              disabled={p.usedCount > 0}
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={p.usedCount > 0}
                title={p.usedCount > 0 ? tAlerts("PromotionInUse") : undefined}
              />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];
  const width = columns.reduce((s, c) => s + c.width, 0);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">
          <GiftOutlined /> {t("Title")}
        </h1>
        {can("promotions.create") && (
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => open(null)}
          >
            {t("New")}
          </Button>
        )}
      </div>
      <Alert className="mb-3" type="info" showIcon title={t("RulesHint")} />
      <Table
        bordered
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={promotions}
        tableLayout="fixed"
        scroll={{ x: width }}
        pagination={promotions.length > 20 ? { pageSize: 20 } : false}
      />

      <Modal
        open={Boolean(editing)}
        width={760}
        title={editing?.id ? t("Edit") : t("New")}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        okText={t("Save")}
        confirmLoading={saving}
        forceRender
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={save}
          requiredMark={false}
        >
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="arName"
                label={t("ArName")}
                rules={[{ required: true, message: tAlerts("RequiredField") }]}
              >
                <Input maxLength={150} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="enName" label={t("EnName")}>
                <Input maxLength={150} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="scope" label={t("Scope")}>
            <Segmented
              block
              options={["invoice", "category", "product", "loyalty"].map(
                (s) => ({
                  value: s,
                  label: t(`scopes.${s}`),
                }),
              )}
              onChange={(v) => {
                if (v === "invoice" && discountType === "fixedPrice") {
                  form.setFieldValue("discountType", "percent");
                }
                // عرض الولاء: المرة المجانية 100% افتراضيًا
                if (v === "loyalty") {
                  form.setFieldsValue({
                    discountType: "percent",
                    value: form.getFieldValue("value") ?? 100,
                    loyaltyTarget:
                      form.getFieldValue("loyaltyTarget") ?? "service",
                  });
                }
              }}
            />
          </Form.Item>

          {/* عرض الولاء: كل كام مرة مدفوعة ← المرة اللي بعدها بخصم */}
          {isLoyalty && (
            <>
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="loyaltyEvery"
                    label={t("LoyaltyEvery")}
                    extra={t("LoyaltyEveryHint")}
                    rules={[
                      { required: true, message: tAlerts("RequiredField") },
                    ]}
                  >
                    <InputNumber
                      min={1}
                      max={1000}
                      precision={0}
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="loyaltyTarget" label={t("LoyaltyTarget")}>
                    <Segmented
                      block
                      options={["service", "category", "product"].map((v) => ({
                        value: v,
                        label: t(`loyaltyTargets.${v}`),
                      }))}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Alert
                type="info"
                showIcon
                className="mb-3"
                title={t("LoyaltyHint")}
              />
            </>
          )}

          {pick === "category" && (
            <Form.Item
              name="categoryIds"
              label={t("Categories")}
              extra={t("CategoriesHint")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
            >
              <TreeSelect
                multiple
                treeCheckable
                treeCheckStrictly={false}
                showCheckedStrategy={TreeSelect.SHOW_PARENT}
                treeData={categoryTree}
                treeDefaultExpandAll
                placeholder={t("ChooseCategories")}
                style={{ width: "100%" }}
              />
            </Form.Item>
          )}
          {pick === "product" && (
            <Form.Item
              name="productIds"
              label={t("Products")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
            >
              <Select
                mode="multiple"
                showSearch
                allowClear
                optionFilterProp="label"
                placeholder={t("ChooseProducts")}
                options={productOptions}
                maxTagCount="responsive"
              />
            </Form.Item>
          )}

          <Row gutter={12}>
            <Col
              xs={24}
              sm={12}
              style={isLoyalty ? { display: "none" } : undefined}
            >
              <Form.Item name="discountType" label={t("DiscountType")}>
                <Select
                  options={[
                    { value: "percent", label: t("types.percent") },
                    { value: "amount", label: t("types.amount") },
                    ...(scope === "invoice"
                      ? []
                      : [
                          { value: "fixedPrice", label: t("types.fixedPrice") },
                        ]),
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="value"
                label={
                  isLoyalty
                    ? t("LoyaltyValue")
                    : discountType === "percent"
                      ? `${t("Value")} (%)`
                      : `${t("Value")} (${symbol})`
                }
                extra={
                  scope !== "invoice" && discountType !== "percent"
                    ? t("PerBaseUnitHint")
                    : undefined
                }
                rules={[{ required: true, message: tAlerts("RequiredField") }]}
              >
                <InputNumber
                  style={{ width: "100%" }}
                  min={0}
                  max={discountType === "percent" ? 100 : undefined}
                  precision={discountType === "percent" ? 2 : decimals}
                />
              </Form.Item>
            </Col>
          </Row>

          {scope === "invoice" && (
            <Form.Item
              name="minInvoice"
              label={`${t("MinInvoice")} (${symbol})`}
              extra={t("MinInvoiceHint")}
            >
              <InputNumber
                style={{ width: "100%" }}
                min={0}
                precision={decimals}
              />
            </Form.Item>
          )}

          <Row gutter={12}>
            <Col xs={12}>
              <Form.Item
                name="startDate"
                label={t("From")}
                rules={[{ required: true, message: tAlerts("RequiredField") }]}
              >
                <DayPicker />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item
                name="endDate"
                label={t("To")}
                rules={[{ required: true, message: tAlerts("RequiredField") }]}
              >
                <DayPicker />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col xs={24} sm={8}>
              <Form.Item
                name="allBranches"
                label={t("AllBranches")}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
            {!allBranches && (
              <Col xs={24} sm={16}>
                <Form.Item
                  name="branchIds"
                  label={t("Branches")}
                  rules={[
                    { required: true, message: tAlerts("RequiredField") },
                  ]}
                >
                  <Select
                    mode="multiple"
                    options={options.branches.map((b) => ({
                      value: b.id,
                      label: nm(b),
                    }))}
                  />
                </Form.Item>
              </Col>
            )}
          </Row>

          <Row gutter={12}>
            <Col xs={24} sm={8}>
              <Form.Item
                name="isActive"
                label={t("Active")}
                valuePropName="checked"
              >
                <Switch disabled={!can("promotions.activate")} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={16}>
              <Form.Item name="notes" label={t("Notes")}>
                <Input maxLength={500} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

"use client";

import { useState } from "react";
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
  Select,
  Space,
  Table,
} from "antd";
import { message } from "@/components/common/feedback";
import { DeleteOutlined, SendOutlined, UndoOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { today } from "@/lib/dates";
import { formatDocNo } from "@/lib/doc-number";
import {
  browseStockProductsAction,
  createTransferAction,
  searchStockProductsAction,
} from "@/actions/inventory.actions";
import DayPicker from "@/components/common/DayPicker";
import { showActionError } from "@/components/common/actionError";
import ProductPicker from "@/components/purchases/ProductPicker";
import ProductBrowser from "@/components/purchases/ProductBrowser";
import "@/components/purchases/purchases.css";
import "@/components/common/table.css";

let lineKey = 0;

// ============================================================
// تحويل مخزني جديد (الخطوة الأولى: الإرسال)
// - البضاعة تخرج من المستودع المُرسِل فوراً وتصبح "في الطريق"
// - المستودع المستلِم يستلمها لاحقاً من شاشة التحويل
// fromWarehouses: المستودعات التي يقدر يرسل منها
// toWarehouses: كل المستودعات النشطة
// ============================================================
export default function TransferForm({
  fromWarehouses = [],
  toWarehouses = [],
  defaultFromId,
  categories = [],
  canChangeDate,
}) {
  const [form] = Form.useForm();
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Inventory");
  const tAlerts = useTranslations("Alerts");
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const todayDay = today();
  const fromId = Form.useWatch("fromWarehouseId", form);

  // إضافة صنف (لو موجود بنفس الوحدة: نزود الكمية)
  const addProduct = (product, unitId, opts = {}) => {
    const add = opts.qty ?? 1;
    setLines((prev) => {
      const i = prev.findIndex(
        (l) => l.product.id === product.id && l.unitId === unitId,
      );
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: Number((next[i].qty + add).toFixed(3)) };
        return next;
      }
      return [...prev, { key: ++lineKey, product, unitId, qty: add }];
    });
  };

  const patch = (key, change) =>
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...change } : l)),
    );
  const remove = (key) => setLines((prev) => prev.filter((l) => l.key !== key));

  const reset = () => {
    setLines([]);
    form.resetFields();
  };

  const submit = async (values) => {
    if (!lines.length) return message.warning(tAlerts("NoItems"));
    if (lines.some((l) => !(l.qty > 0))) {
      return message.warning(tAlerts("MustBePositive"));
    }
    setSaving(true);
    const res = await createTransferAction({
      ...values,
      date: canChangeDate ? values.date : undefined,
      items: lines.map((l) => ({
        productId: l.product.id,
        unitId: l.unitId,
        qty: l.qty,
      })),
    });
    setSaving(false);
    if (!res.success) {
      if (res.fieldErrors) {
        form.setFields(
          Object.entries(res.fieldErrors)
            .filter(([name]) => !name.startsWith("items"))
            .map(([name, err]) => ({ name, errors: [tAlerts(err)] })),
        );
      }
      return showActionError(res, tAlerts, locale);
    }
    message.success(
      t("TransferSent", { number: formatDocNo("transfer", res.data.number) }),
    );
    router.push(`/inventory/transfers/${res.data.id}`);
  };

  const columns = [
    {
      title: "#",
      key: "i",
      width: 50,
      render: (_, __, i) => i + 1,
    },
    {
      title: t("Item"),
      key: "item",
      width: 260,
      render: (_, l) => (
        <div>
          <div className="pur-line__name">{nameOf(l.product)}</div>
          <div className="pur-line__code">
            <bdi>{l.product.code}</bdi>
          </div>
        </div>
      ),
    },
    {
      title: t("Unit"),
      key: "unit",
      width: 140,
      render: (_, l) => (
        <Select
          style={{ width: "100%" }}
          value={l.unitId}
          onChange={(v) => patch(l.key, { unitId: v })}
          options={l.product.units.map((u) => ({
            value: u.unit.id,
            label: nameOf(u.unit),
          }))}
        />
      ),
    },
    {
      title: t("Qty"),
      key: "qty",
      width: 130,
      render: (_, l) => (
        <InputNumber
          style={{ width: "100%" }}
          min={0}
          precision={3}
          controls={false}
          value={l.qty}
          status={l.qty > 0 ? undefined : "error"}
          onFocus={(e) => e.target.select()}
          formatter={(v) => (v === "" || v == null ? "" : String(Number(v)))}
          onChange={(v) => patch(l.key, { qty: v ?? 0 })}
        />
      ),
    },
    {
      title: "",
      key: "remove",
      width: 60,
      render: (_, l) => (
        <Button
          danger
          type="text"
          icon={<DeleteOutlined />}
          onClick={() => remove(l.key)}
        />
      ),
    },
  ];

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={submit}
      initialValues={{
        fromWarehouseId:
          defaultFromId ??
          (fromWarehouses.length === 1 ? fromWarehouses[0].id : undefined),
        date: todayDay,
      }}
    >
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">{t("NewTransfer")}</h1>
        <Space>
          <Button size="large" icon={<UndoOutlined />} onClick={reset}>
            {t("Reset")}
          </Button>
          <Button
            type="primary"
            size="large"
            htmlType="submit"
            icon={<SendOutlined />}
            loading={saving}
          >
            {t("SendTransfer")}
          </Button>
        </Space>
      </div>

      <Alert type="info" showIcon className="mb-3" title={t("TransferHint")} />

      <Card size="small" className="mb-3">
        <Row gutter={12}>
          <Col xs={24} md={7}>
            <Form.Item
              name="fromWarehouseId"
              label={t("FromWarehouse")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
            >
              <Select
                options={fromWarehouses.map((w) => ({
                  value: w.id,
                  label: nameOf(w),
                }))}
                onChange={(v) => {
                  if (form.getFieldValue("toWarehouseId") === v) {
                    form.setFieldValue("toWarehouseId", undefined);
                  }
                }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={7}>
            <Form.Item
              name="toWarehouseId"
              label={t("ToWarehouse")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
            >
              <Select
                options={toWarehouses
                  .filter((w) => w.id !== fromId)
                  .map((w) => ({ value: w.id, label: nameOf(w) }))}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={4}>
            <Form.Item name="date" label={t("Date")}>
              <DayPicker disabled={!canChangeDate} max={todayDay} />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item name="notes" label={t("Notes")}>
              <Input maxLength={255} />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      <Card size="small">
        <div className="flex flex-wrap gap-2 mb-3">
          <div style={{ flex: "1 1 320px" }}>
            <ProductPicker
              onAdd={addProduct}
              searchAction={searchStockProductsAction}
            />
          </div>
          <ProductBrowser
            categories={categories}
            onAdd={addProduct}
            browseAction={browseStockProductsAction}
          />
        </div>

        <Table
          bordered
          size="small"
          rowKey="key"
          columns={columns}
          dataSource={lines}
          tableLayout="fixed"
          scroll={{ x: 640 }}
          pagination={false}
          locale={{
            emptyText: <Empty description={t("AddItemsHint")} />,
          }}
        />
      </Card>
    </Form>
  );
}

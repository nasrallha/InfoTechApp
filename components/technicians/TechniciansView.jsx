"use client";

import { useStaffT } from "./useStaffT";
import { useState } from "react";
import {
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  MinusCircleOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { searchSaleProductsAction } from "@/actions/sale.actions";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import StatusFilters from "@/components/common/StatusFilters";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { applyFieldErrors } from "@/lib/form-errors";
import { useCan } from "@/components/auth/AuthProvider";
import {
  createTechnicianAction,
  deleteTechnicianAction,
  updateTechnicianAction,
} from "@/actions/technician.actions";
import { C } from "@/lib/theme";
import PhoneField from "@/components/common/PhoneField";

const TECH_COLORS = { active: C.accent, inactive: C.muted, all: C.info };
const isIn = (r, f) =>
  f === "all" ? true : f === "active" ? r.isActive : !r.isActive;

// ============================================================
// الفنيون: الاسم والجوال ونسبة العمولة من الخدمات اللي بينفذها
// ============================================================
export default function TechniciansView({ technicians, categories = [] }) {
  const t = useStaffT();
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const locale = useLocale();
  const can = useCan();
  const [form] = Form.useForm();
  const [editing, setEditing] = useState(null); // {} جديد | فني
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("active");
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  const req = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
  ];

  const save = async (v) => {
    const payload = {
      ...v,
      rates: (v.rates ?? []).map((r) => ({
        categoryId: r.target === "category" ? (r.categoryId ?? null) : null,
        productId: r.target === "product" ? (r.productId ?? null) : null,
        rateType: r.rateType ?? "percent",
        value: Number(r.value) || 0,
      })),
    };
    setSaving(true);
    const res = editing?.id
      ? await updateTechnicianAction({ ...payload, id: editing.id })
      : await createTechnicianAction(payload);
    setSaving(false);
    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      return showActionError(res, tAlerts, locale);
    }
    message.success(t("Saved"));
    setEditing(null);
  };

  const remove = async (r) => {
    const res = await deleteTechnicianAction(r.id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Deleted"));
  };

  return (
    <>
      <PageHeader
        title={t("Title")}
        subtitle={t("Subtitle")}
        buttonTitle={can("technicians.create") ? t("New") : null}
        onButtonClick={() => setEditing({})}
      />
      <StatusFilters
        className="mb-3"
        value={filter}
        onChange={setFilter}
        options={["active", "inactive", "all"].map((f) => ({
          value: f,
          label: t(`Filter_${f}`),
          color: TECH_COLORS[f],
          count: technicians.filter((r) => isIn(r, f)).length,
        }))}
      />
      <Table
        className="sc-table"
        rowKey="id"
        size="small"
        rowClassName={() => "sc-row"}
        onRow={(r) => ({
          style: { "--c": TECH_COLORS[r.isActive ? "active" : "inactive"] },
        })}
        dataSource={technicians.filter((r) => isIn(r, filter))}
        pagination={false}
        scroll={{ x: 900 }}
        columns={[
          { title: "#", width: 60, render: (_, __, i) => i + 1 },
          { title: t("Name"), render: (_, r) => <b>{nm(r)}</b> },
          {
            title: t("Phone"),
            width: 150,
            render: (_, r) => (r.phone ? <bdi>{r.phone}</bdi> : "—"),
          },
          {
            title: t("ServiceRate"),
            width: 110,
            render: (_, r) => <Tag color="purple">{r.commissionRate}%</Tag>,
          },
          {
            title: t("ProductRate"),
            width: 130,
            render: (_, r) =>
              r.productRate > 0 ? (
                <Tag color="magenta">{r.productRate}%</Tag>
              ) : (
                "—"
              ),
          },
          {
            title: t("Rates"),
            width: 130,
            render: (_, r) =>
              r.rates?.length ? (
                <Tag color="gold">{t("RatesCount", { n: r.rates.length })}</Tag>
              ) : (
                "—"
              ),
          },
          {
            title: t("Jobs"),
            width: 100,
            render: (_, r) => r._count.saleItems + r._count.visits,
          },
          {
            title: t("Status"),
            width: 100,
            render: (_, r) =>
              r.isActive ? (
                <Tag color={TECH_COLORS.active}>{t("Active")}</Tag>
              ) : (
                <Tag>{t("Inactive")}</Tag>
              ),
          },
          {
            title: "",
            width: 100,
            render: (_, r) => (
              <Space>
                {can("technicians.update") && (
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => setEditing(r)}
                  />
                )}
                {can("technicians.delete") && (
                  <Popconfirm
                    title={t("ConfirmDelete")}
                    onConfirm={() => remove(r)}
                  >
                    <Button aria-label={tButtons("Delete")} title={tButtons("Delete")} danger type="text" icon={<DeleteOutlined />} />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      {editing && (
        <Modal
          open
          width={760}
          title={editing.id ? t("Edit") : t("New")}
          onCancel={() => setEditing(null)}
          onOk={() => form.submit()}
          confirmLoading={saving}
          destroyOnHidden
        >
          <Form
            form={form}
            preserve={false}
            layout="vertical"
            autoComplete="off"
            onFinish={save}
            initialValues={{
              arName: editing.arName ?? "",
              enName: editing.enName ?? "",
              phone: editing.phone ?? "",
              commissionRate: editing.commissionRate ?? 0,
              productRate: editing.productRate ?? 0,
              rates: (editing.rates ?? []).map((r) => ({
                target: r.productId ? "product" : "category",
                categoryId: r.categoryId ?? undefined,
                productId: r.productId ?? undefined,
                product: r.product ?? null,
                rateType: r.rateType,
                value: r.value,
              })),
              isActive: editing.isActive ?? true,
              notes: editing.notes ?? "",
            }}
          >
            {/* الحقول القصيرة جنب بعض عشان المودال ميطولش */}
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item name="arName" label={t("ArName")} rules={req}>
                  <Input autoComplete="off" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="enName" label={t("EnName")} rules={req}>
                  <Input dir="ltr" autoComplete="off" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <PhoneField label={t("Phone")} />
              </Col>
              <Col xs={12} md={8}>
                <Form.Item
                  name="commissionRate"
                  label={t("ServiceRate")}
                  tooltip={t("RateHint")}
                >
                  <InputNumber
                    min={0}
                    max={100}
                    suffix="%"
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item
                  name="productRate"
                  label={t("ProductRate")}
                  tooltip={t("ProductRateHint")}
                >
                  <InputNumber
                    min={0}
                    max={100}
                    suffix="%"
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </Col>
            </Row>
            <RatesEditor t={t} categories={categories} nm={nm} />
            <Row gutter={12}>
              <Col xs={18} md={20}>
                <Form.Item name="notes" label={t("Notes")}>
                  <Input.TextArea
                    autoSize={{ minRows: 1, maxRows: 3 }}
                    maxLength={500}
                  />
                </Form.Item>
              </Col>
              <Col xs={6} md={4}>
                <Form.Item
                  name="isActive"
                  label={t("Status")}
                  valuePropName="checked"
                >
                  <Switch />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Modal>
      )}
    </>
  );
}

// ---------- استثناءات العمولة: قسم أو صنف بنسبة / مبلغ ----------
function RatesEditor({ t, categories, nm }) {
  const parentName = new Map(categories.map((c) => [c.id, c]));
  const catLabel = (c) => {
    const p = c.parentId ? parentName.get(c.parentId) : null;
    return p ? `${nm(p)} / ${nm(c)}` : nm(c);
  };
  return (
    <Form.List name="rates">
      {(fields, { add, remove }) => (
        <div className="mb-3">
          <div className="mb-1">
            <b>{t("Rates")}</b>
          </div>
          <div className="mb-2" style={{ color: C.muted, fontSize: 12 }}>
            {t("RatesHint")}
          </div>
          {fields.map((f) => (
            <Row key={f.key} gutter={8} align="top">
              <Col xs={8} md={5}>
                <Form.Item name={[f.name, "target"]} className="mb-2">
                  <Select
                    options={[
                      { value: "category", label: t("TargetCategory") },
                      { value: "product", label: t("TargetProduct") },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col xs={16} md={9}>
                <Form.Item noStyle shouldUpdate>
                  {({ getFieldValue }) =>
                    getFieldValue(["rates", f.name, "target"]) === "product" ? (
                      <Form.Item
                        name={[f.name, "productId"]}
                        className="mb-2"
                        rules={[{ required: true, message: "" }]}
                      >
                        <ProductSearch
                          initial={getFieldValue(["rates", f.name, "product"])}
                          placeholder={t("PickProduct")}
                          nm={nm}
                        />
                      </Form.Item>
                    ) : (
                      <Form.Item
                        name={[f.name, "categoryId"]}
                        className="mb-2"
                        rules={[{ required: true, message: "" }]}
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder={t("PickCategory")}
                          options={categories.map((c) => ({
                            value: c.id,
                            label: catLabel(c),
                          }))}
                        />
                      </Form.Item>
                    )
                  }
                </Form.Item>
              </Col>
              <Col xs={10} md={5}>
                <Form.Item name={[f.name, "rateType"]} className="mb-2">
                  <Select
                    options={[
                      { value: "percent", label: t("Percent") },
                      { value: "amount", label: t("Amount") },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col xs={11} md={4}>
                <Form.Item
                  name={[f.name, "value"]}
                  className="mb-2"
                  rules={[{ required: true, message: "" }]}
                >
                  <InputNumber min={0} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={3} md={1}>
                <Button
                  type="text"
                  danger
                  icon={<MinusCircleOutlined />}
                  onClick={() => remove(f.name)}
                />
              </Col>
            </Row>
          ))}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() =>
              add({ target: "category", rateType: "percent", value: 0 })
            }
          >
            {t("AddRate")}
          </Button>
        </div>
      )}
    </Form.List>
  );
}

// بحث عن صنف/خدمة (بالاسم أو الكود) لاستثناء العمولة
function ProductSearch({ value, onChange, initial, placeholder, nm }) {
  const [options, setOptions] = useState(() =>
    initial
      ? [{ value: initial.id, label: `${initial.code} - ${nm(initial)}` }]
      : [],
  );
  const [loading, setLoading] = useState(false);
  const search = async (q) => {
    if (!q.trim()) return;
    setLoading(true);
    const res = await searchSaleProductsAction(q);
    setLoading(false);
    if (res.success)
      setOptions(
        res.data.map((p) => ({ value: p.id, label: `${p.code} - ${nm(p)}` })),
      );
  };
  return (
    <Select
      showSearch
      value={value}
      onChange={onChange}
      filterOption={false}
      onSearch={search}
      loading={loading}
      placeholder={placeholder}
      options={options}
    />
  );
}

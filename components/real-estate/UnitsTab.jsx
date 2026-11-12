"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Col,
  Divider,
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
  Tooltip,
} from "antd";
import { DeleteOutlined, EditOutlined, MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { deleteUnitAction, saveUnitAction } from "@/actions/real-estate.actions";
import { useCurrency } from "@/components/common/CurrencyProvider";
import SearchBox from "@/components/common/SearchBox";
import { UNIT_KINDS, USE_TYPES } from "@/lib/rent";
import { formatDocNo } from "@/lib/doc-number";
import { formatDay } from "@/lib/dates";
import { useRecordModal } from "./useRecordModal";
import ClientOnly from "@/components/common/ClientOnly";

// ============================================================
// الوحدات: كل وحدة تحت عقارها (الرقم بيتكرر عادي في عقار تاني)
// - الحالة: متاحة / مؤجرة (في عقد ساري) - بتتحسب لوحدها
// - تفاصيل حرة: أي بند وقيمته (عداد المياه، عداد الكهرباء، عدد الغرف ...)
// ============================================================
export default function UnitsTab({ data, canManage }) {
  const t = useTranslations("RealEstate");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const [propertyId, setPropertyId] = useState(null);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const tenantOf = (c) =>
    c ? (locale === "ar" ? c.customer.arName : c.customer.enName || c.customer.arName) : "";

  const m = useRecordModal({
    saveAction: saveUnitAction,
    deleteAction: deleteUnitAction,
    toForm: (r) => ({
      propertyId: r?.propertyId ?? propertyId ?? undefined,
      unitNo: r?.unitNo ?? "",
      kind: r?.kind ?? "apartment",
      useType: r?.useType ?? "residential",
      floor: r?.floor ?? "",
      area: r?.area ?? null,
      annualRent: r?.annualRent ?? 0,
      details: r?.details?.length ? r.details : [],
      notes: r?.notes ?? "",
      isActive: r?.isActive ?? true,
    }),
    fromForm: (v) => ({
      ...v,
      area: v.area ?? null,
      annualRent: Number(v.annualRent) || 0,
      details: (v.details ?? []).filter((d) => d?.label?.trim()),
    }),
  });

  const rows = useMemo(() => {
    const text = q.trim().toLowerCase();
    return data.units.filter(
      (u) =>
        (!propertyId || u.propertyId === propertyId) &&
        (status === "all" || u.status === status) &&
        (!text ||
          u.unitNo.toLowerCase().includes(text) ||
          u.property.name.toLowerCase().includes(text) ||
          (u.details ?? []).some((d) => String(d.value).toLowerCase().includes(text))),
    );
  }, [data.units, propertyId, status, q]);

  const columns = [
    { title: "#", key: "no", width: 55, align: "center", render: (_, __, i) => i + 1 },
    { title: t("Property"), key: "p", width: 170, render: (_, r) => r.property.name },
    { title: t("UnitNo"), dataIndex: "unitNo", width: 100, render: (v) => <b>{v}</b> },
    { title: t("Kind"), dataIndex: "kind", width: 100, render: (v) => t(`kind_${v}`) },
    {
      title: t("UseType"),
      dataIndex: "useType",
      width: 100,
      align: "center",
      render: (v) => <Tag className="cp-chip">{t(`use_${v}`)}</Tag>,
    },
    { title: t("Floor"), dataIndex: "floor", width: 80, align: "center", render: (v) => v || "—" },
    { title: t("AnnualRent"), dataIndex: "annualRent", width: 120, align: "end", render: (v) => money(v) },
    {
      title: t("Status"),
      key: "s",
      width: 110,
      align: "center",
      render: (_, r) =>
        r.status === "rented" ? (
          <Tooltip
            title={`${formatDocNo("rentContract", r.contract.number, r.contract.docCode)} - ${tenantOf(r.contract)} - ${t("Until")} ${formatDay(r.contract.endDate)}`}
          >
            <Tag color="blue">{t("status_rented")}</Tag>
          </Tooltip>
        ) : (
          <Tag color="green">{t("status_available")}</Tag>
        ),
    },
    {
      title: t("Details"),
      key: "d",
      width: 260,
      render: (_, r) =>
        r.details?.length ? (
          <span className="text-xs text-slate-600">
            {r.details.map((d) => `${d.label}: ${d.value}`).join(" | ")}
          </span>
        ) : (
          "—"
        ),
    },
    ...(canManage
      ? [
          {
            title: "",
            key: "a",
            width: 100,
            align: "center",
            render: (_, r) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => m.open(r)} />
                <Popconfirm title={t("DeleteConfirm")} onConfirm={() => m.remove(r.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} disabled={r._count.contracts > 0} />
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];
  const width = columns.reduce((s, c) => s + (c.width ?? 100), 0);
  const count = (s) => data.units.filter((u) => u.status === s).length;

  return (
    <div>
      <div className="cp-filters mb-3 flex flex-wrap justify-between gap-2">
        <Space wrap>
          <Select
            allowClear
            style={{ width: 220 }}
            placeholder={t("AllProperties")}
            value={propertyId ?? undefined}
            onChange={(v) => setPropertyId(v ?? null)}
            showSearch={{ optionFilterProp: "label" }}
            options={data.properties.map((p) => ({ value: p.id, label: p.name }))}
          />
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: `${t("All")} (${data.units.length})` },
              { value: "available", label: `${t("status_available")} (${count("available")})` },
              { value: "rented", label: `${t("status_rented")} (${count("rented")})` },
            ]}
          />
          <SearchBox
            width={240}
            placeholder={t("SearchUnits")}
            value={search}
            onChange={(v) => {
              setSearch(v);
              if (!v) setQ("");
            }}
            onSearch={(v) => setQ(v)}
          />
        </Space>
        {canManage && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!data.properties.length}
            onClick={() => m.open(null)}
          >
            {t("NewUnit")}
          </Button>
        )}
      </div>
      <Table
        bordered
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={rows}
        tableLayout="fixed"
        pagination={{ pageSize: 50, showSizeChanger: false }}
        scroll={{ x: width }}
        locale={{ emptyText: data.properties.length ? t("NoUnits") : t("AddPropertyFirst") }}
      />

      {/* النافذة في المتصفح بس (forceRender من غير hydration error) */}
      <ClientOnly>
        <Modal
          open={Boolean(m.editing)}
          title={m.editing?.id ? t("EditUnit") : t("NewUnit")}
          onCancel={m.close}
          onOk={() => m.form.submit()}
          confirmLoading={m.saving}
          width={900}
          forceRender
        >
          <Form form={m.form} layout="vertical" autoComplete="off" className="compact-modal-form" onFinish={m.save}>
            <Row gutter={[12, 0]}>
              <Col xs={24} md={8}>
                <Form.Item name="propertyId" label={t("Property")} rules={[{ required: true, message: tAlerts("RequiredField") }]}>
                  <Select
                    showSearch={{ optionFilterProp: "label" }}
                    options={data.properties.map((p) => ({ value: p.id, label: p.name }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} md={4}>
                <Form.Item
                  name="unitNo"
                  label={t("UnitNo")}
                  tooltip={t("UnitNoHint")}
                  rules={[{ required: true, whitespace: true, message: tAlerts("RequiredField") }]}
                >
                  <Input maxLength={30} />
                </Form.Item>
              </Col>
              <Col xs={12} md={4}>
                <Form.Item name="kind" label={t("Kind")}>
                  <Select options={UNIT_KINDS.map((k) => ({ value: k, label: t(`kind_${k}`) }))} />
                </Form.Item>
              </Col>
              <Col xs={12} md={4}>
                <Form.Item name="useType" label={t("UseType")} tooltip={t("UseTypeHint")}>
                  <Select options={USE_TYPES.map((k) => ({ value: k, label: t(`use_${k}`) }))} />
                </Form.Item>
              </Col>
              <Col xs={12} md={4}>
                <Form.Item name="floor" label={t("Floor")}>
                  <Input maxLength={20} />
                </Form.Item>
              </Col>
              <Col xs={12} md={4}>
                <Form.Item name="area" label={t("Area")}>
                  <InputNumber min={0} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item
                  name="annualRent"
                  label={t("AnnualRent")}
                  tooltip={t("AnnualRentHint")}
                  rules={[{ required: true, message: tAlerts("RequiredField") }]}
                >
                  <InputNumber min={0} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={18} md={10}>
                <Form.Item name="notes" label={t("Notes")}>
                  <Input maxLength={500} />
                </Form.Item>
              </Col>
              <Col xs={6} md={4}>
                <Form.Item name="isActive" label={t("Active")} valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Col>
            </Row>

            {/* التفاصيل الحرة: بند + قيمته */}
            <Divider titlePlacement="start" plain>
              {t("Details")}
            </Divider>
            <Form.List name="details">
              {(fields, { add, remove }) => (
                <>
                  <Row gutter={[12, 0]}>
                    {fields.map(({ key, name }) => (
                      <Col xs={24} md={12} key={key}>
                        <Space.Compact block className="mb-2">
                          <Form.Item
                            name={[name, "label"]}
                            noStyle
                            rules={[{ required: true, whitespace: true, message: tAlerts("RequiredField") }]}
                          >
                            <Input placeholder={t("DetailLabel")} maxLength={60} style={{ width: "45%" }} />
                          </Form.Item>
                          <Form.Item name={[name, "value"]} noStyle>
                            <Input placeholder={t("DetailValue")} maxLength={200} style={{ width: "55%" }} />
                          </Form.Item>
                          <Button icon={<MinusCircleOutlined />} onClick={() => remove(name)} />
                        </Space.Compact>
                      </Col>
                    ))}
                  </Row>
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ label: "", value: "" })}>
                    {t("AddDetail")}
                  </Button>
                </>
              )}
            </Form.List>
          </Form>
        </Modal>
      </ClientOnly>
    </div>
  );
}

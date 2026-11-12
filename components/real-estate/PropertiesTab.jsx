"use client";

import { Button, Col, Form, Input, Modal, Popconfirm, Row, Select, Space, Switch, Table, Tag } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { deletePropertyAction, savePropertyAction } from "@/actions/real-estate.actions";
import { useRecordModal } from "./useRecordModal";
import ClientOnly from "@/components/common/ClientOnly";

// العقارات (عمارة / مجمّع): المدينة والحي والمالك - الجديد على فرع المستخدم
export default function PropertiesTab({ data, canManage }) {
  const t = useTranslations("RealEstate");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const m = useRecordModal({
    saveAction: savePropertyAction,
    deleteAction: deletePropertyAction,
    toForm: (r) => ({
      name: r?.name ?? "",
      city: r?.city ?? "",
      district: r?.district ?? "",
      address: r?.address ?? "",
      notes: r?.notes ?? "",
      ownerId: r?.ownerId ?? undefined,
      isActive: r?.isActive ?? true,
    }),
    fromForm: (v) => ({ ...v, ownerId: v.ownerId ?? null }),
  });

  const columns = [
    { title: "#", key: "no", width: 60, align: "center", render: (_, __, i) => i + 1 },
    { title: t("PropertyName"), dataIndex: "name", width: 200 },
    { title: t("City"), dataIndex: "city", width: 120, render: (v) => v || "—" },
    { title: t("District"), dataIndex: "district", width: 140, render: (v) => v || "—" },
    { title: t("Owner"), key: "o", width: 170, render: (_, r) => r.owner?.name ?? "—" },
    { title: t("Branch"), key: "b", width: 130, render: (_, r) => nameOf(r.branch) },
    { title: t("UnitsCount"), key: "u", width: 100, align: "center", render: (_, r) => r._count.units },
    {
      title: t("Status"),
      key: "s",
      width: 100,
      align: "center",
      render: (_, r) => (r.isActive ? <Tag color="green">{t("Active")}</Tag> : <Tag>{t("Inactive")}</Tag>),
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
                  <Button size="small" danger icon={<DeleteOutlined />} disabled={r._count.units > 0} />
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      {canManage && (
        <div className="flex justify-end mb-3">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => m.open(null)}>
            {t("NewProperty")}
          </Button>
        </div>
      )}
      <Table
        bordered
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={data.properties}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        scroll={{ x: 1120 }}
        locale={{ emptyText: t("NoProperties") }}
      />
      {/* النافذة في المتصفح بس (forceRender من غير hydration error) */}
      <ClientOnly>
        <Modal
          open={Boolean(m.editing)}
          title={m.editing?.id ? t("EditProperty") : t("NewProperty")}
          onCancel={m.close}
          onOk={() => m.form.submit()}
          confirmLoading={m.saving}
          width={860}
          forceRender
        >
          <Form form={m.form} layout="vertical" autoComplete="off" className="compact-modal-form" onFinish={m.save}>
            <Row gutter={[12, 0]}>
              <Col xs={24} md={9}>
                <Form.Item
                  name="name"
                  label={t("PropertyName")}
                  tooltip={t("PropertyNameHint")}
                  rules={[{ required: true, whitespace: true, message: tAlerts("RequiredField") }]}
                >
                  <Input maxLength={150} />
                </Form.Item>
              </Col>
              <Col xs={12} md={5}>
                <Form.Item name="city" label={t("City")}>
                  <Input maxLength={100} />
                </Form.Item>
              </Col>
              <Col xs={12} md={5}>
                <Form.Item name="district" label={t("District")}>
                  <Input maxLength={100} />
                </Form.Item>
              </Col>
              <Col xs={24} md={5}>
                <Form.Item name="ownerId" label={t("Owner")}>
                  <Select
                    allowClear
                    showSearch={{ optionFilterProp: "label" }}
                    options={data.owners
                      .filter((o) => o.isActive || o.id === m.editing?.ownerId)
                      .map((o) => ({ value: o.id, label: o.name }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={10}>
                <Form.Item name="address" label={t("Address")}>
                  <Input maxLength={255} />
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
          </Form>
        </Modal>
      </ClientOnly>
    </div>
  );
}

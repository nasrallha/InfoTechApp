"use client";

import { Button, Col, Form, Input, Modal, Popconfirm, Row, Space, Switch, Table, Tag } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { deleteOwnerAction, saveOwnerAction } from "@/actions/real-estate.actions";
import { useRecordModal } from "./useRecordModal";
import ClientOnly from "@/components/common/ClientOnly";

// الملّاك (كشف حساب المالك = إيجارات وحدات عقاراته - في التقارير)
export default function OwnersTab({ data, canManage }) {
  const t = useTranslations("RealEstate");
  const tAlerts = useTranslations("Alerts");
  const m = useRecordModal({
    saveAction: saveOwnerAction,
    deleteAction: deleteOwnerAction,
    toForm: (r) => ({
      name: r?.name ?? "",
      phone: r?.phone ?? "",
      idNumber: r?.idNumber ?? "",
      notes: r?.notes ?? "",
      isActive: r?.isActive ?? true,
    }),
  });

  const columns = [
    { title: "#", key: "no", width: 60, align: "center", render: (_, __, i) => i + 1 },
    { title: t("OwnerName"), dataIndex: "name", width: 220 },
    { title: t("Phone"), dataIndex: "phone", width: 140, render: (v) => (v ? <bdi>{v}</bdi> : "—") },
    { title: t("IdNumber"), dataIndex: "idNumber", width: 150, render: (v) => v || "—" },
    {
      title: t("PropertiesCount"),
      key: "c",
      width: 110,
      align: "center",
      render: (_, r) => r._count.properties,
    },
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
                  <Button size="small" danger icon={<DeleteOutlined />} disabled={r._count.properties > 0} />
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
            {t("NewOwner")}
          </Button>
        </div>
      )}
      <Table
        bordered
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={data.owners}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        scroll={{ x: 900 }}
        locale={{ emptyText: t("NoOwners") }}
      />
      {/* النافذة في المتصفح بس (forceRender من غير hydration error) */}
      <ClientOnly>
        <Modal
          open={Boolean(m.editing)}
          title={m.editing?.id ? t("EditOwner") : t("NewOwner")}
          onCancel={m.close}
          onOk={() => m.form.submit()}
          confirmLoading={m.saving}
          width={720}
          forceRender
        >
          <Form form={m.form} layout="vertical" autoComplete="off" className="compact-modal-form" onFinish={m.save}>
            <Row gutter={[12, 0]}>
              <Col xs={24} md={12}>
                <Form.Item name="name" label={t("OwnerName")} rules={[{ required: true, whitespace: true, message: tAlerts("RequiredField") }]}>
                  <Input maxLength={150} />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item name="phone" label={t("Phone")}>
                  <Input maxLength={20} dir="ltr" />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item name="idNumber" label={t("IdNumber")}>
                  <Input maxLength={30} dir="ltr" />
                </Form.Item>
              </Col>
              <Col xs={18} md={20}>
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

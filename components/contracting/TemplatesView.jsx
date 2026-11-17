"use client";

import { useRef } from "react";
import {
  Alert,
  Button,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
} from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, StarFilled } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import ClientOnly from "@/components/common/ClientOnly";
import { useRecordModal } from "@/components/real-estate/useRecordModal";
import { deleteTemplateAction, saveTemplateAction } from "@/actions/contracting.actions";
import { CONTRACT_KINDS, DEFAULT_TEMPLATE, TEMPLATE_FIELDS } from "@/lib/contracting";
import { C } from "@/lib/theme";

// ============================================================
// نماذج صيغة عقود المقاولات: نص فيه خانات بتتملي لوحدها ({party_name} ...)
// - الضغط على الخانة بيحطها مكان المؤشر في النص
// - العقد بيتحفظ بنصه النهائي، فتعديل النموذج مبيغيرش العقود القديمة
// ============================================================
export default function TemplatesView({ templates, canManage }) {
  const t = useTranslations("Contracting");
  const tAlerts = useTranslations("Alerts");
  const area = useRef(null);
  const m = useRecordModal({
    saveAction: saveTemplateAction,
    deleteAction: deleteTemplateAction,
    toForm: (r) => ({
      name: r?.name ?? "",
      kind: r?.kind ?? undefined,
      content: r?.content ?? DEFAULT_TEMPLATE,
      isDefault: r?.isDefault ?? false,
      isActive: r?.isActive ?? true,
    }),
    fromForm: (v) => ({ ...v, kind: v.kind ?? null }),
  });

  // الخانة مكان المؤشر
  const insert = (key) => {
    const el = area.current?.resizableTextArea?.textArea;
    const text = m.form.getFieldValue("content") ?? "";
    const token = `{${key}}`;
    const at = el ? el.selectionStart : text.length;
    const end = el ? el.selectionEnd : text.length;
    m.form.setFieldValue("content", text.slice(0, at) + token + text.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = at + token.length;
    });
  };

  const columns = [
    { title: "#", key: "no", width: 60, align: "center", render: (_, __, i) => i + 1 },
    {
      title: t("TemplateName"),
      key: "n",
      render: (_, r) => (
        <Space>
          {r.isDefault && (
            <Tooltip title={t("DefaultTemplate")}>
              <StarFilled style={{ color: C.warning }} />
            </Tooltip>
          )}
          <b>{r.name}</b>
        </Space>
      ),
    },
    {
      title: t("ContractKind"),
      dataIndex: "kind",
      width: 160,
      align: "center",
      render: (v) => (v ? t(`kind_${v}`) : t("AllKinds")),
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
                <Button size="small" aria-label={t("Edit")} title={t("Edit")} icon={<EditOutlined />} onClick={() => m.open(r)} />
                <Popconfirm title={t("DeleteTemplateConfirm")} onConfirm={() => m.remove(r.id)}>
                  <Button size="small" danger aria-label={t("Delete")} title={t("Delete")} icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title={t("TemplatesTitle")}
        extra={
          canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => m.open(null)}>
              {t("NewTemplate")}
            </Button>
          ) : null
        }
      />
      <Table bordered size="small" rowKey="id" columns={columns} dataSource={templates} pagination={false} scroll={{ x: 600 }} />
      <ClientOnly>
        <Modal
          open={Boolean(m.editing)}
          title={m.editing?.id ? t("EditTemplate") : t("NewTemplate")}
          onCancel={m.close}
          onOk={() => m.form.submit()}
          confirmLoading={m.saving}
          width={1000}
          mask={{ closable: false }}
          forceRender
        >
          <Form form={m.form} layout="vertical" autoComplete="off" className="compact-modal-form" onFinish={m.save}>
            <Row gutter={[12, 0]}>
              <Col xs={24} md={10}>
                <Form.Item name="name" label={t("TemplateName")} rules={[{ required: true, whitespace: true, message: tAlerts("RequiredField") }]}>
                  <Input maxLength={100} />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item name="kind" label={t("ContractKind")} tooltip={t("TemplateKindHint")}>
                  <Select allowClear placeholder={t("AllKinds")} options={CONTRACT_KINDS.map((k) => ({ value: k, label: t(`kind_${k}`) }))} />
                </Form.Item>
              </Col>
              <Col xs={6} md={4}>
                <Form.Item name="isDefault" label={t("DefaultTemplate")} valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Col>
              <Col xs={6} md={4}>
                <Form.Item name="isActive" label={t("Active")} valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Col>
            </Row>
            <Alert type="info" showIcon className="mb-2" title={t("FieldsHint")} />
            <div className="flex flex-wrap gap-1 mb-2">
              {TEMPLATE_FIELDS.map((k) => (
                <Button key={k} size="small" onClick={() => insert(k)}>
                  {t(`f_${k}`)}
                </Button>
              ))}
            </div>
            <Form.Item name="content" rules={[{ required: true, whitespace: true, message: tAlerts("RequiredField") }]}>
              <Input.TextArea ref={area} rows={18} maxLength={30000} style={{ lineHeight: 1.8 }} />
            </Form.Item>
          </Form>
        </Modal>
      </ClientOnly>
    </div>
  );
}

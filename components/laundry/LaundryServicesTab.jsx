"use client";

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
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { applyFieldErrors } from "@/lib/form-errors";
import { useCan } from "@/components/auth/AuthProvider";
import {
  createLaundryServiceAction,
  deleteLaundryServiceAction,
  updateLaundryServiceAction,
} from "@/actions/laundry.actions";
import { C } from "@/lib/theme";
import "@/components/common/table.css";

// ============================================================
// خدمات المغسلة: غسيل، غسيل وكي، كي، كي بالبخار...
// الترتيب = ترتيب الأعمدة في جدول الأسعار وأزرار شاشة الاستلام
// ============================================================
export default function LaundryServicesTab({ services }) {
  const t = useTranslations("Laundry");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const locale = useLocale();
  const can = useCan();
  const canManage = can("laundry.manage");
  const [form] = Form.useForm();
  const [editing, setEditing] = useState(null); // {} جديدة | خدمة
  const [saving, setSaving] = useState(false);
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  const req = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
  ];

  const save = async (v) => {
    setSaving(true);
    const res = editing?.id
      ? await updateLaundryServiceAction({ ...v, id: editing.id })
      : await createLaundryServiceAction(v);
    setSaving(false);
    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      return showActionError(res, tAlerts, locale);
    }
    message.success(t("Saved"));
    setEditing(null);
  };

  const remove = async (r) => {
    const res = await deleteLaundryServiceAction(r.id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Deleted"));
  };

  const nextOrder =
    services.reduce((m, s) => Math.max(m, s.sortOrder), 0) + 1;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <span style={{ color: C.muted, fontSize: 13 }}>
          {t("ServicesHint")}
        </span>
        {canManage && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setEditing({})}
          >
            {t("NewService")}
          </Button>
        )}
      </div>
      <Table
        rowKey="id"
        size="small"
        dataSource={services}
        pagination={false}
        scroll={{ x: 640 }}
        columns={[
          { title: "#", width: 60, render: (_, __, i) => i + 1 },
          { title: t("Service"), render: (_, r) => <b>{nm(r)}</b> },
          { title: t("SortOrder"), width: 90, dataIndex: "sortOrder" },
          {
            title: t("ItemsCount"),
            width: 120,
            render: (_, r) => r._count.prices,
          },
          {
            title: t("Status"),
            width: 100,
            render: (_, r) =>
              r.isActive ? (
                <Tag color={C.success}>{t("Active")}</Tag>
              ) : (
                <Tag>{t("Inactive")}</Tag>
              ),
          },
          canManage && {
            title: "",
            width: 100,
            render: (_, r) => (
              <Space>
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  aria-label={tButtons("Edit")}
                  title={tButtons("Edit")}
                  onClick={() => setEditing(r)}
                />
                <Popconfirm
                  title={t("ConfirmDeleteService")}
                  description={
                    r._count.prices
                      ? t("DeleteServiceHint", { n: r._count.prices })
                      : null
                  }
                  okButtonProps={{ danger: true }}
                  onConfirm={() => remove(r)}
                >
                  <Button
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    aria-label={tButtons("Delete")}
                    title={tButtons("Delete")}
                  />
                </Popconfirm>
              </Space>
            ),
          },
        ].filter(Boolean)}
      />

      {editing && (
        <Modal
          open
          width={560}
          title={editing.id ? t("EditService") : t("NewService")}
          onCancel={() => setEditing(null)}
          onOk={() => form.submit()}
          confirmLoading={saving}
          mask={{ closable: false }}
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
              sortOrder: editing.sortOrder ?? nextOrder,
              isActive: editing.isActive ?? true,
            }}
          >
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
              <Col xs={12} md={8}>
                <Form.Item
                  name="sortOrder"
                  label={t("SortOrder")}
                  tooltip={t("SortOrderHint")}
                >
                  <InputNumber
                    min={0}
                    max={9999}
                    precision={0}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item
                  name="isActive"
                  label={t("Status")}
                  tooltip={t("InactiveHint")}
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

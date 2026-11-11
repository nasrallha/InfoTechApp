"use client";

import { useState } from "react";
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import {
  deleteExpenseCategoryAction,
  saveExpenseCategoryAction,
} from "@/actions/account.actions";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCan } from "@/components/auth/AuthProvider";

// ============================================================
// بنود المصروفات (إيجار، رواتب، كهرباء ...) تُستخدم في سندات الصرف
// البند المستخدم في سندات لا يُحذف (يمكن إيقافه)
// ============================================================
export default function ExpenseCategoriesView({ categories }) {
  const [form] = Form.useForm();
  const [editing, setEditing] = useState(null); // null | {} | row
  const [saving, setSaving] = useState(false);
  const locale = useLocale();
  const t = useTranslations("Accounts");
  const tTable = useTranslations("Table");
  const tAlerts = useTranslations("Alerts");
  const can = useCan();

  const open = (row) => {
    setEditing(row ?? {});
    form.setFieldsValue(
      row
        ? { arName: row.arName, enName: row.enName, isActive: row.isActive }
        : { arName: "", enName: "", isActive: true },
    );
  };

  const save = async (values) => {
    setSaving(true);
    const res = await saveExpenseCategoryAction({
      ...values,
      ...(editing?.id ? { id: editing.id } : {}),
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

  const remove = async (id) => {
    const res = await deleteExpenseCategoryAction(id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Deleted"));
  };

  const columns = [
    // المسلسل حسب الصفوف (مش رقم السجل)
    { title: "#", key: "rowNo", width: 60, align: "center", render: (_, __, i) => i + 1 },
    { title: t("ArName"), dataIndex: "arName" },
    { title: t("EnName"), dataIndex: "enName" },
    {
      title: t("VouchersCount"),
      key: "count",
      width: 110,
      align: "center",
      render: (_, r) => r._count.vouchers,
    },
    {
      title: tTable("Status"),
      key: "active",
      width: 100,
      align: "center",
      render: (_, r) =>
        r.isActive ? (
          <Tag color="green">{t("Active")}</Tag>
        ) : (
          <Tag>{t("Inactive")}</Tag>
        ),
    },
    {
      title: tTable("Actions"),
      key: "actions",
      width: 110,
      align: "center",
      render: (_, r) => (
        <Space>
          {can("expenseCategories.update") && (
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => open(r)}
            />
          )}
          {can("expenseCategories.delete") && (
            <Popconfirm
              title={t("DeleteConfirm")}
              onConfirm={() => remove(r.id)}
              disabled={r._count.vouchers > 0}
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={r._count.vouchers > 0}
              />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">{t("ExpenseCategories")}</h1>
        {can("expenseCategories.create") && (
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => open(null)}
          >
            {t("NewExpenseCategory")}
          </Button>
        )}
      </div>
      <Table
        bordered
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={categories}
        pagination={false}
        scroll={{ x: 700 }}
      />
      <Modal
        open={Boolean(editing)}
        title={editing?.id ? t("EditExpenseCategory") : t("NewExpenseCategory")}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        forceRender
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item
            name="arName"
            label={t("ArName")}
            rules={[{ required: true, message: tAlerts("RequiredField") }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            name="enName"
            label={t("EnName")}
            rules={[{ required: true, message: tAlerts("RequiredField") }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            name="isActive"
            label={t("Active")}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

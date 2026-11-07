"use client";

import { useState } from "react";
import {
  Button,
  Col,
  Form,
  Input,
  InputNumber,
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
import { useCan } from "@/components/auth/AuthProvider";
import {
  createRestaurantSizeAction,
  deleteRestaurantSizeAction,
  updateRestaurantSizeAction,
} from "@/actions/restaurant.actions";
import { C } from "@/lib/theme";
import EntityModal from "./EntityModal";

// ============================================================
// الأحجام (صغير، وسط، كبير...): كل صنف بيختار أحجامه وسعر كل حجم
// ============================================================
export default function RestaurantSizesTab({ sizes }) {
  const t = useTranslations("Restaurant");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const locale = useLocale();
  const can = useCan();
  const canManage = can("restaurant.manage");
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  const [editing, setEditing] = useState(null);
  const req = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
  ];

  const remove = async (r) => {
    const res = await deleteRestaurantSizeAction(r.id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Deleted"));
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <span style={{ color: C.muted, fontSize: 13 }}>{t("SizesHint")}</span>
        {canManage && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() =>
              setEditing({
                sortOrder: sizes.reduce((m, s) => Math.max(m, s.sortOrder), 0) + 1,
              })
            }
          >
            {t("NewSize")}
          </Button>
        )}
      </div>
      <Table
        rowKey="id"
        size="small"
        dataSource={sizes}
        pagination={false}
        scroll={{ x: 480 }}
        columns={[
          { title: t("SortOrder"), dataIndex: "sortOrder", width: 80 },
          { title: t("Size"), render: (_, r) => <b>{nm(r)}</b> },
          {
            title: t("Status"),
            dataIndex: "isActive",
            width: 110,
            render: (v) =>
              v ? (
                <Tag color="green">{t("Active")}</Tag>
              ) : (
                <Tag>{t("Inactive")}</Tag>
              ),
          },
          ...(canManage
            ? [
                {
                  title: "",
                  width: 90,
                  render: (_, r) => (
                    <Space size={0}>
                      <Button
                        size="small"
                        type="text"
                        icon={<EditOutlined />}
                        title={tButtons("Edit")}
                        onClick={() => setEditing(r)}
                      />
                      <Popconfirm
                        title={t("ConfirmDeleteSize")}
                        okButtonProps={{ danger: true }}
                        onConfirm={() => remove(r)}
                      >
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          title={tButtons("Delete")}
                        />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />

      {editing && (
        <EntityModal
          width={560}
          title={editing.id ? t("EditSize") : t("NewSize")}
          initialValues={{
            arName: editing.arName ?? "",
            enName: editing.enName ?? "",
            sortOrder: editing.sortOrder ?? 0,
            isActive: editing.isActive ?? true,
          }}
          save={(v) =>
            editing.id
              ? updateRestaurantSizeAction({ ...v, id: editing.id })
              : createRestaurantSizeAction(v)
          }
          onClose={() => setEditing(null)}
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
                label={t("Active")}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </EntityModal>
      )}
    </>
  );
}

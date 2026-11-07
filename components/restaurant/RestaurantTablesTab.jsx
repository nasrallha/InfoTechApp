"use client";

import { useState } from "react";
import {
  Button,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
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
import { deleteTableAction, saveTableAction } from "@/actions/restaurant-table.actions";
import { C } from "@/lib/theme";
import EntityModal from "./EntityModal";

// ============================================================
// الطاولات (لكل فرع): الاسم/الرقم وعدد الكراسي
// - الكاشير بيختار الطاولة في طلبات الصالة (ويشوف المشغولة)
// - العميل بيحجز طاولة فاضية من الطلب الأونلاين حسب عدد الأفراد
// ============================================================
export default function RestaurantTablesTab({ tables, branches }) {
  const t = useTranslations("Restaurant");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const locale = useLocale();
  const can = useCan();
  const canManage = can("restaurant.manage");
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? null);
  const [editing, setEditing] = useState(null);
  const rows = tables.filter((x) => !branchId || x.branchId === branchId);
  const req = [{ required: true, whitespace: true, message: tAlerts("RequiredField") }];

  const remove = async (r) => {
    const res = await deleteTableAction(r.id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Deleted"));
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <Space wrap>
          {branches.length > 1 && (
            <Select
              style={{ minWidth: 200 }}
              value={branchId}
              onChange={setBranchId}
              options={branches.map((b) => ({ value: b.id, label: nm(b) }))}
            />
          )}
          <span style={{ color: C.muted, fontSize: 13 }}>{t("TablesHint")}</span>
        </Space>
        {canManage && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!branchId}
            onClick={() =>
              setEditing({
                branchId,
                sortOrder: rows.reduce((m, x) => Math.max(m, x.sortOrder), 0) + 1,
              })
            }
          >
            {t("NewTable")}
          </Button>
        )}
      </div>
      <Table
        rowKey="id"
        size="small"
        dataSource={rows}
        pagination={false}
        scroll={{ x: 480 }}
        locale={{
          emptyText: (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("NoTables")} />
          ),
        }}
        columns={[
          { title: t("SortOrder"), dataIndex: "sortOrder", width: 80 },
          { title: t("TableName"), render: (_, r) => <b>{r.name}</b> },
          {
            title: t("Seats"),
            dataIndex: "seats",
            width: 110,
            render: (v) => t("SeatsN", { n: v }),
          },
          {
            title: t("Status"),
            dataIndex: "isActive",
            width: 100,
            render: (v) =>
              v ? <Tag color="green">{t("Active")}</Tag> : <Tag>{t("Inactive")}</Tag>,
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
                        title={t("ConfirmDeleteTable")}
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
          width={600}
          title={editing.id ? t("EditTable") : t("NewTable")}
          initialValues={{
            branchId: editing.branchId,
            name: editing.name ?? "",
            seats: editing.seats ?? 4,
            sortOrder: editing.sortOrder ?? 0,
            isActive: editing.isActive ?? true,
          }}
          save={(v) =>
            saveTableAction({
              ...v,
              id: editing.id ?? null,
              seats: v.seats ?? 4,
              sortOrder: v.sortOrder ?? 0,
            })
          }
          onClose={() => setEditing(null)}
        >
          <Row gutter={12}>
            <Col xs={12} md={8}>
              <Form.Item name="name" label={t("TableName")} rules={req}>
                <Input autoComplete="off" placeholder="1، 2، VIP..." maxLength={30} />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item name="seats" label={t("Seats")}>
                <InputNumber min={1} max={100} precision={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item name="branchId" label={t("Branch")}>
                <Select options={branches.map((b) => ({ value: b.id, label: nm(b) }))} />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item name="sortOrder" label={t("SortOrder")}>
                <InputNumber min={0} max={9999} precision={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item name="isActive" label={t("Active")} valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </EntityModal>
      )}
    </>
  );
}

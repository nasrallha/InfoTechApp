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
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useCan } from "@/components/auth/AuthProvider";
import {
  createRestaurantDriverAction,
  deleteRestaurantDriverAction,
  updateRestaurantDriverAction,
} from "@/actions/restaurant.actions";
import { C } from "@/lib/theme";
import EntityModal from "./EntityModal";

// ============================================================
// السائقين (التوصيل): مين وصّل الطلب، وعمولته
// commissionType: percent نسبة من رسوم التوصيل | amount مبلغ على كل طلب
// (تقرير السائقين: عدد الطلبات ورسوم التوصيل والعمولة - المرحلة الجاية)
// ============================================================
export default function RestaurantDriversTab({ drivers }) {
  const t = useTranslations("Restaurant");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const locale = useLocale();
  const can = useCan();
  const canManage = can("restaurant.manage");
  const { amount: money } = useCurrency();
  const [editing, setEditing] = useState(null);
  const req = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
  ];

  const remove = async (r) => {
    const res = await deleteRestaurantDriverAction(r.id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Deleted"));
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <span style={{ color: C.muted, fontSize: 13 }}>{t("DriversHint")}</span>
        {canManage && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setEditing({})}
          >
            {t("NewDriver")}
          </Button>
        )}
      </div>
      <Table
        rowKey="id"
        size="small"
        dataSource={drivers}
        pagination={false}
        scroll={{ x: 560 }}
        columns={[
          { title: t("DriverName"), render: (_, r) => <b>{r.name}</b> },
          {
            title: t("Phone"),
            dataIndex: "phone",
            render: (v) => (v ? <bdi dir="ltr">{v}</bdi> : "—"),
          },
          {
            title: t("DriverCommission"),
            render: (_, r) =>
              !r.commissionValue
                ? "—"
                : r.commissionType === "percent"
                  ? t("CommissionPercentText", { v: r.commissionValue })
                  : t("CommissionAmountText", { v: money(r.commissionValue) }),
          },
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
                        title={t("ConfirmDeleteDriver")}
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
          width={680}
          title={editing.id ? t("EditDriver") : t("NewDriver")}
          initialValues={{
            name: editing.name ?? "",
            phone: editing.phone ?? "",
            commissionType: editing.commissionType ?? "amount",
            commissionValue: editing.commissionValue ?? 0,
            isActive: editing.isActive ?? true,
          }}
          save={(v) => {
            const data = { ...v, commissionValue: v.commissionValue ?? 0 };
            return editing.id
              ? updateRestaurantDriverAction({ ...data, id: editing.id })
              : createRestaurantDriverAction(data);
          }}
          onClose={() => setEditing(null)}
        >
          <DriverFields req={req} />
        </EntityModal>
      )}
    </>
  );
}

function DriverFields({ req }) {
  const t = useTranslations("Restaurant");
  const type = Form.useWatch("commissionType");
  return (
    <Row gutter={12}>
      <Col xs={24} md={12}>
        <Form.Item name="name" label={t("DriverName")} rules={req}>
          <Input autoComplete="off" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item name="phone" label={t("Phone")}>
          <Input dir="ltr" inputMode="tel" autoComplete="off" />
        </Form.Item>
      </Col>
      <Col xs={12} md={8}>
        <Form.Item
          name="commissionType"
          label={t("CommissionType")}
          tooltip={t("DriverCommissionHint")}
        >
          <Select
            options={["amount", "percent"].map((v) => ({
              value: v,
              label: t(`driverCommission.${v}`),
            }))}
          />
        </Form.Item>
      </Col>
      <Col xs={12} md={8}>
        <Form.Item name="commissionValue" label={t("CommissionValue")}>
          <InputNumber
            min={0}
            max={type === "percent" ? 100 : undefined}
            suffix={type === "percent" ? "%" : undefined}
            style={{ width: "100%" }}
          />
        </Form.Item>
      </Col>
      <Col xs={12} md={8}>
        <Form.Item name="isActive" label={t("Active")} valuePropName="checked">
          <Switch />
        </Form.Item>
      </Col>
    </Row>
  );
}

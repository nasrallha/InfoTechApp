"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Flex,
  Popconfirm,
  Space,
  Table,
  Tag,
} from "antd";
import { message } from "@/components/common/feedback";
import { HomeOutlined, StarFilled, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import FormModal from "@/components/common/FormModal";
import { StatusBadge } from "@/components/common/tableFilters";
import { useCan } from "@/components/auth/AuthProvider";
import { deleteWarehousesAction } from "@/actions/warehouse.actions";
import WarehouseForm from "./WarehouseForm";
import { C } from "@/lib/theme";
import "@/components/common/table.css";

// شاشة المستودعات: الرئيسي بنجمة، وكل مستودع والفروع المربوطة به
export default function WarehousesView({ warehouses = [] }) {
  const [modal, setModal] = useState({ open: false, warehouse: null });
  const locale = useLocale();
  const t = useTranslations("Inventory");
  const tSidebar = useTranslations("Sidebar");
  const tTable = useTranslations("Table");
  const tForm = useTranslations("Form");
  const tButtons = useTranslations("Buttons");
  const tAlerts = useTranslations("Alerts");
  const can = useCan();
  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);

  const remove = async (id) => {
    const res = await deleteWarehousesAction([id]);
    if (!res.success) return message.error(tAlerts(res.error));
    message.success(tAlerts("WarehouseDeleted"));
  };

  const columns = [
    {
      title: tTable("Name"),
      key: "name",
      width: 220,
      render: (_, r) => (
        <Space>
          {r.isMain && <StarFilled style={{ color: C.warning }} />}
          <b>{nameOf(r)}</b>
        </Space>
      ),
    },
    {
      title: t("LinkedBranches"),
      key: "branches",
      width: 260,
      render: (_, r) =>
        r.branches.length ? (
          <Space wrap size={4}>
            {r.branches.map((b) => (
              <Tag key={b.id} color="blue">
                {nameOf(b)}
              </Tag>
            ))}
          </Space>
        ) : (
          "—"
        ),
    },
    {
      title: t("Notes"),
      dataIndex: "notes",
      key: "notes",
      width: 200,
      ellipsis: true,
    },
    {
      title: tTable("Status"),
      key: "status",
      width: 150,
      render: (_, r) =>
        r.isMain ? (
          <Tag color="gold" icon={<StarFilled />}>
            {t("MainWarehouse")}
          </Tag>
        ) : (
          <StatusBadge active={r.isActive} tForm={tForm} />
        ),
    },
    ...(can("warehouses.update") || can("warehouses.delete")
      ? [
          {
            title: tTable("Actions"),
            key: "actions",
            width: 180,
            render: (_, r) => (
              <Space>
                {can("warehouses.update") && (
                  <Tag
                    color={C.primary}
                    style={{
                      padding: "6px 12px",
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                    icon={<EditOutlined />}
                    onClick={() => setModal({ open: true, warehouse: r })}
                  >
                    {tButtons("Edit")}
                  </Tag>
                )}
                {can("warehouses.delete") && !r.isMain && (
                  <Popconfirm
                    title={tAlerts("Confirm")}
                    description={tAlerts("ConfirmDelete")}
                    okText={tButtons("Yes")}
                    cancelText={tButtons("No")}
                    onConfirm={() => remove(r.id)}
                  >
                    <Button aria-label={tButtons("Delete")} title={tButtons("Delete")} size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]
      : []),
  ];
  const width = columns.reduce((s, c) => s + (c.width ?? 0), 0);

  return (
    <>
      <PageHeader
        title={tSidebar("Warehouses")}
        buttonTitle={can("warehouses.create") ? t("AddWarehouse") : null}
        onButtonClick={() => setModal({ open: true, warehouse: null })}
      />
      <Alert
        type="info"
        showIcon
        className="mb-4"
        title={t("WarehousesHint")}
      />
      <Table
        bordered
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={warehouses}
        pagination={false}
        tableLayout="fixed"
        scroll={{ x: width }}
      />
      <FormModal
        open={modal.open}
        onCancel={() => setModal({ open: false, warehouse: null })}
        title={
          <Flex align="center" justify="center" gap="small">
            <HomeOutlined />
            <span>
              {modal.warehouse ? t("EditWarehouse") : t("AddWarehouse")}
            </span>
          </Flex>
        }
        formId="WarehouseForm"
      >
        <WarehouseForm formId="WarehouseForm" warehouse={modal.warehouse} />
      </FormModal>
    </>
  );
}

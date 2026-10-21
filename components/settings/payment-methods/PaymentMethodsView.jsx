"use client";

import { useState } from "react";
import { Alert, Button, Flex, Popconfirm, Space, Table, Tag } from "antd";
import { message } from "@/components/common/feedback";
import {
  CheckOutlined,
  CreditCardOutlined,
  MinusOutlined,
} from "@ant-design/icons";
import { AiFillDelete, AiTwotoneEdit } from "react-icons/ai";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import FormModal from "@/components/common/FormModal";
import { StatusBadge } from "@/components/common/tableFilters";
import { useCan } from "@/components/auth/AuthProvider";
import { deletePaymentMethodsAction } from "@/actions/payment-method.actions";
import PaymentMethodForm from "./PaymentMethodForm";
import "@/components/common/table.css";

// لون كل نوع في الجدول
const TYPE_COLORS = {
  cash: "green",
  card: "blue",
  wallet: "purple",
  transfer: "cyan",
  credit: "orange",
};

// شاشة طرق الدفع: تظهر لاحقاً في شاشة الدفع بالفواتير بنفس الترتيب
export default function PaymentMethodsView({ methods = [] }) {
  const [modal, setModal] = useState({ open: false, method: null });
  const [busyId, setBusyId] = useState(null);

  const locale = useLocale();
  const t = useTranslations("PaymentMethods");
  const tSidebar = useTranslations("Sidebar");
  const tTable = useTranslations("Table");
  const tForm = useTranslations("Form");
  const tButtons = useTranslations("Buttons");
  const tAlerts = useTranslations("Alerts");
  const can = useCan();
  const canCreate = can("paymentMethods.create");
  const canUpdate = can("paymentMethods.update");
  const canDelete = can("paymentMethods.delete");

  const remove = async (id) => {
    setBusyId(id);
    const res = await deletePaymentMethodsAction([id]);
    setBusyId(null);
    if (!res.success) return message.error(tAlerts(res.error));
    message.success(tAlerts("PaymentMethodDeleted"));
  };

  const columns = [
    {
      title: t("SortOrder"),
      dataIndex: "sortOrder",
      key: "sortOrder",
      width: 90,
      align: "center",
    },
    {
      title: tTable("Name"),
      key: "name",
      width: 220,
      ellipsis: true,
      render: (_, r) => (locale === "ar" ? r.arName : r.enName),
    },
    {
      title: t("Type"),
      dataIndex: "type",
      key: "type",
      width: 140,
      align: "center",
      render: (v) => <Tag color={TYPE_COLORS[v]}>{t(`types.${v}`)}</Tag>,
    },
    {
      title: t("RequiresReference"),
      dataIndex: "requiresReference",
      key: "requiresReference",
      width: 150,
      align: "center",
      render: (v) =>
        v ? (
          <CheckOutlined style={{ color: "#389e0d" }} />
        ) : (
          <MinusOutlined style={{ color: "#bbb" }} />
        ),
    },
    {
      title: tTable("Status"),
      key: "status",
      width: 130,
      align: "center",
      render: (_, r) => <StatusBadge active={r.isActive} tForm={tForm} />,
    },
    ...(canUpdate || canDelete
      ? [
          {
            title: tTable("Actions"),
            key: "action",
            width: 200,
            align: "center",
            render: (_, r) => (
              <Space>
                {canUpdate && (
                  <Tag
                    color="#006266"
                    style={{
                      padding: "6px 12px",
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                    icon={<AiTwotoneEdit />}
                    onClick={() => setModal({ open: true, method: r })}
                  >
                    {tButtons("Edit")}
                  </Tag>
                )}
                {canDelete && (
                  <Popconfirm
                    title={tAlerts("Confirm")}
                    description={tAlerts("ConfirmDelete")}
                    okText={tButtons("Yes")}
                    cancelText={tButtons("No")}
                    onConfirm={() => remove(r.id)}
                  >
                    <Button
                      size="small"
                      danger
                      icon={<AiFillDelete />}
                      loading={busyId === r.id}
                    />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]
      : []),
  ];

  const TABLE_WIDTH = columns.reduce((s, c) => s + (c.width ?? 0), 0);

  return (
    <>
      <PageHeader
        title={tSidebar("PaymentMethods")}
        buttonTitle={canCreate ? t("AddMethod") : null}
        onButtonClick={() => setModal({ open: true, method: null })}
      />

      <Alert
        type="info"
        showIcon
        icon={<CreditCardOutlined />}
        className="mb-4"
        title={t("Hint")}
      />

      <Table
        bordered
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={methods}
        pagination={false}
        tableLayout="fixed"
        scroll={{ x: TABLE_WIDTH, y: 500 }}
      />

      <FormModal
        open={modal.open}
        onCancel={() => setModal({ open: false, method: null })}
        title={
          <Flex align="center" justify="center" gap="small">
            <CreditCardOutlined />
            <span>{modal.method ? t("EditMethod") : t("AddMethod")}</span>
          </Flex>
        }
        formId="PaymentMethodForm"
      >
        <PaymentMethodForm formId="PaymentMethodForm" method={modal.method} />
      </FormModal>
    </>
  );
}

"use client";

import { useState } from "react";
import { Alert, Button, Flex, Popconfirm, Space, Table, Tag, Tooltip } from "antd";
import { message } from "@/components/common/feedback";
import { DollarOutlined, StarFilled, StarOutlined } from "@ant-design/icons";
import { AiFillDelete, AiTwotoneEdit } from "react-icons/ai";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import FormModal from "@/components/common/FormModal";
import { StatusBadge } from "@/components/common/tableFilters";
import { useCan } from "@/components/auth/AuthProvider";
import {
  deleteCurrenciesAction,
  setBaseCurrencyAction,
} from "@/actions/currency.actions";
import CurrencyForm from "./CurrencyForm";
import "@/components/common/table.css";

// شاشة العملات: العملة الأساسية مميزة بنجمة، ويمكن تغييرها
export default function CurrenciesView({ currencies = [] }) {
  const [modal, setModal] = useState({ open: false, currency: null });
  const [busyId, setBusyId] = useState(null);

  const locale = useLocale();
  const t = useTranslations("Currencies");
  const tSidebar = useTranslations("Sidebar");
  const tTable = useTranslations("Table");
  const tForm = useTranslations("Form");
  const tButtons = useTranslations("Buttons");
  const tAlerts = useTranslations("Alerts");
  const can = useCan();
  const canEdit = can("currencies.update");

  const nameOf = (c) => (locale === "ar" ? c.arName : c.enName);
  const base = currencies.find((c) => c.isBase);

  const run = async (id, action, successKey) => {
    setBusyId(id);
    const res = await action();
    setBusyId(null);
    if (!res.success) return message.error(tAlerts(res.error));
    message.success(tAlerts(successKey));
  };

  const columns = [
    {
      title: t("Code"),
      dataIndex: "code",
      key: "code",
      width: 100,
      align: "center",
      render: (v, r) => (
        <Space>
          {r.isBase && <StarFilled style={{ color: "#d4a017" }} />}
          <b dir="ltr">{v}</b>
        </Space>
      ),
    },
    {
      title: tTable("Name"),
      key: "name",
      width: 200,
      ellipsis: true,
      render: (_, r) => nameOf(r),
    },
    {
      title: t("Symbol"),
      key: "symbol",
      width: 140,
      align: "center",
      render: (_, r) => (
        <span>
          {r.arSymbol} / <bdi>{r.enSymbol}</bdi>
        </span>
      ),
    },
    {
      title: t("Decimals"),
      dataIndex: "decimals",
      key: "decimals",
      width: 110,
      align: "center",
    },
    {
      title: tTable("Status"),
      key: "status",
      width: 170,
      align: "center",
      render: (_, r) =>
        r.isBase ? (
          <Tag color="gold" icon={<StarFilled />}>
            {t("Base")}
          </Tag>
        ) : (
          <StatusBadge active={r.isActive} tForm={tForm} />
        ),
    },
    ...(canEdit
      ? [
          {
            title: tTable("Actions"),
            key: "action",
            width: 260,
            align: "center",
            render: (_, r) => (
              <Space>
                <Tag
                  color="#006266"
                  style={{ padding: "6px 12px", fontSize: 14, cursor: "pointer" }}
                  icon={<AiTwotoneEdit />}
                  onClick={() => setModal({ open: true, currency: r })}
                >
                  {tButtons("Edit")}
                </Tag>
                {!r.isBase && (
                  <Popconfirm
                    title={t("MakeBaseTitle")}
                    description={t("MakeBaseWarning")}
                    okText={tButtons("Yes")}
                    cancelText={tButtons("No")}
                    onConfirm={() =>
                      run(r.id, () => setBaseCurrencyAction(r.id), "BaseCurrencyChanged")
                    }
                  >
                    <Tooltip title={t("MakeBase")}>
                      <Button size="small" icon={<StarOutlined />} loading={busyId === r.id} />
                    </Tooltip>
                  </Popconfirm>
                )}
                {!r.isBase && (
                  <Popconfirm
                    title={tAlerts("Confirm")}
                    description={tAlerts("ConfirmDelete")}
                    okText={tButtons("Yes")}
                    cancelText={tButtons("No")}
                    onConfirm={() =>
                      run(r.id, () => deleteCurrenciesAction([r.id]), "CurrencyDeleted")
                    }
                  >
                    <Button size="small" danger icon={<AiFillDelete />} />
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
        title={tSidebar("Currencies")}
        buttonTitle={canEdit ? t("AddCurrency") : null}
        onButtonClick={() => setModal({ open: true, currency: null })}
      />

      {base && (
        <Alert
          type="info"
          showIcon
          icon={<DollarOutlined />}
          className="mb-4"
          title={
            <span>
              {t("BaseIs")}: <b>{nameOf(base)}</b> (<bdi>{base.code}</bdi>)
            </span>
          }
          description={t("BaseHint")}
        />
      )}

      <Table
        bordered
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={currencies}
        pagination={false}
        tableLayout="fixed"
        scroll={{ x: TABLE_WIDTH, y: 500 }}
      />

      <FormModal
        open={modal.open}
        onCancel={() => setModal({ open: false, currency: null })}
        title={
          <Flex align="center" justify="center" gap="small">
            <DollarOutlined />
            <span>{modal.currency ? t("EditCurrency") : t("AddCurrency")}</span>
          </Flex>
        }
        formId="CurrencyForm"
      >
        <CurrencyForm formId="CurrencyForm" currency={modal.currency} />
      </FormModal>
    </>
  );
}

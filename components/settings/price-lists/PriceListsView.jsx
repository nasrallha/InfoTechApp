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
import { DollarOutlined, TagsOutlined } from "@ant-design/icons";
import { AiFillDelete, AiTwotoneEdit } from "react-icons/ai";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import PageHeader from "@/components/common/PageHeader";
import FormModal from "@/components/common/FormModal";
import { StatusBadge } from "@/components/common/tableFilters";
import { useCan } from "@/components/auth/AuthProvider";
import { deletePriceListsAction } from "@/actions/price-list.actions";
import PriceListForm from "./PriceListForm";
import "@/components/common/table.css";

// شاشة قوائم الأسعار: كل قائمة، الفروع المربوطة بها، وعدد الأسعار فيها
export default function PriceListsView({ priceLists = [] }) {
  const [modal, setModal] = useState({ open: false, priceList: null });
  const locale = useLocale();
  const t = useTranslations("PriceLists");
  const tSidebar = useTranslations("Sidebar");
  const tTable = useTranslations("Table");
  const tForm = useTranslations("Form");
  const tButtons = useTranslations("Buttons");
  const tAlerts = useTranslations("Alerts");
  const can = useCan();
  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);

  const remove = async (id) => {
    const res = await deletePriceListsAction([id]);
    if (!res.success) return message.error(tAlerts(res.error));
    message.success(tAlerts("PriceListDeleted"));
  };

  const columns = [
    {
      title: tTable("Name"),
      key: "name",
      width: 220,
      render: (_, r) => (
        <Link href={`/settings/price-lists/${r.id}`}>
          <b>{nameOf(r)}</b>
        </Link>
      ),
    },
    {
      title: t("Branches"),
      key: "branches",
      width: 240,
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
      title: t("PricesCount"),
      key: "count",
      width: 120,
      render: (_, r) => <Tag color="green">{r._count.prices}</Tag>,
    },
    {
      title: tTable("Status"),
      key: "status",
      width: 120,
      render: (_, r) => <StatusBadge active={r.isActive} tForm={tForm} />,
    },
    {
      title: tTable("Actions"),
      key: "actions",
      width: 260,
      render: (_, r) => (
        <Space>
          <Link href={`/settings/price-lists/${r.id}`}>
            <Button size="small" type="primary" icon={<DollarOutlined />}>
              {t("EditPrices")}
            </Button>
          </Link>
          {can("priceLists.update") && (
            <Tag
              color="#006266"
              style={{ padding: "4px 10px", cursor: "pointer" }}
              icon={<AiTwotoneEdit />}
              onClick={() => setModal({ open: true, priceList: r })}
            >
              {tButtons("Edit")}
            </Tag>
          )}
          {can("priceLists.delete") && (
            <Popconfirm
              title={tAlerts("Confirm")}
              description={t("DeleteWarning")}
              okText={tButtons("Yes")}
              cancelText={tButtons("No")}
              onConfirm={() => remove(r.id)}
            >
              <Button size="small" danger icon={<AiFillDelete />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];
  const width = columns.reduce((s, c) => s + c.width, 0);

  return (
    <>
      <PageHeader
        title={tSidebar("PriceLists")}
        buttonTitle={can("priceLists.create") ? t("AddPriceList") : null}
        onButtonClick={() => setModal({ open: true, priceList: null })}
      />
      <Alert type="info" showIcon className="mb-4" title={t("Hint")} />
      <Table
        bordered
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={priceLists}
        pagination={false}
        tableLayout="fixed"
        scroll={{ x: width }}
      />
      <FormModal
        open={modal.open}
        onCancel={() => setModal({ open: false, priceList: null })}
        title={
          <Flex align="center" justify="center" gap="small">
            <TagsOutlined />
            <span>
              {modal.priceList ? t("EditPriceList") : t("AddPriceList")}
            </span>
          </Flex>
        }
        formId="PriceListForm"
      >
        <PriceListForm formId="PriceListForm" priceList={modal.priceList} />
      </FormModal>
    </>
  );
}

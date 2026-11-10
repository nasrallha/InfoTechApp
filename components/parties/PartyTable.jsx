"use client";
import { useEffect, useState } from "react";
import { Table, Space, Button, Tag, Popconfirm, Flex } from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { message } from "@/components/common/feedback";
import { useLocale, useTranslations } from "next-intl";
import { useCan } from "@/components/auth/AuthProvider";
import FormModal from "@/components/common/FormModal";
import {
  textFilter,
  statusFilter,
  StatusBadge,
} from "@/components/common/tableFilters";
import PartyForm from "./PartyForm";
import { C } from "@/lib/theme";
import { listSep } from "@/lib/list-sep";
import "@/components/common/table.css";

const formatMoney = (v) =>
  Number(v ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// جدول العملاء أو الموردين
// parties: البيانات من السيرفر، config: إعدادات النوع
const PartyTable = ({
  parties = [],
  config,
  onSelectionChange,
  branches = null,
}) => {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  // التحديد يُستخدم كمان في التصدير (Excel / طباعة / PDF): المحدد فقط أو الكل
  useEffect(() => {
    onSelectionChange?.(selectedRows);
  }, [selectedRows, onSelectionChange]);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const locale = useLocale();
  const tTable = useTranslations("Table");
  const tButtons = useTranslations("Buttons");
  const can = useCan();
  const canEdit = can(`${config.permission}.update`);
  const canDelete = can(`${config.permission}.delete`);
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");
  const tHeadings = useTranslations("Headings");

  const nameOf = (p) => (locale === "ar" ? p.arName : p.enName);
  const { Icon } = config;

  const deleteParties = async (ids) => {
    setDeleting(true);
    const res = await config.deleteAction(ids);
    setDeleting(false);

    if (!res.success) {
      message.error(tAlerts(res.error));
      return;
    }

    message.success(tAlerts(config.deleted));
    setSelectedRows([]);
  };

  const columns = [
    {
      title: tTable("Code"),
      dataIndex: "code",
      key: "code",
      width: 110,
      sorter: (a, b) => a.code - b.code,
      ...textFilter({
        getValue: (r) => r.code,
        placeholder: tTable("Code"),
        tButtons,
      }),
    },
    {
      title: tTable("Name"),
      key: "name",
      width: 240,
      ellipsis: true,
      align: "center",
      render: (_, r) => nameOf(r),
      sorter: (a, b) => nameOf(a).localeCompare(nameOf(b)),
      ...textFilter({
        getValue: (r) => `${r.arName} ${r.enName}`,
        placeholder: tTable("Name"),
        tButtons,
      }),
    },
    {
      title: tTable("Phone"),
      dataIndex: "phone",
      key: "phone",
      width: 150,
      align: "center",
      render: (v) => v ?? "-",
      ...textFilter({
        getValue: (r) => r.phone,
        placeholder: tTable("Phone"),
        tButtons,
      }),
    },
    {
      title: tTable("TaxNo"),
      dataIndex: "taxNo",
      key: "taxNo",
      width: 190,
      align: "center",
      render: (v) => v ?? "-",
      ...textFilter({
        getValue: (r) => r.taxNo,
        placeholder: tTable("TaxNo"),
        tButtons,
      }),
    },
    {
      title: tTable("City"),
      dataIndex: "city",
      key: "city",
      width: 160,
      ellipsis: true,
      align: "center",
      render: (v) => v ?? "-",
      ...textFilter({
        getValue: (r) => r.city,
        placeholder: tTable("City"),
        tButtons,
      }),
    },
    {
      title: tTable("OpeningBalance"),
      dataIndex: "openingBalance",
      key: "openingBalance",
      width: 170,
      align: "center",
      sorter: (a, b) => a.openingBalance - b.openingBalance,
      render: (v) => (
        <span className={v < 0 ? "text-red-600 font-bold" : ""}>
          {formatMoney(v)}
        </span>
      ),
    },
    // الإتاحة في الفروع
    {
      title: tTable("Branches"),
      key: "branches",
      width: 180,
      ellipsis: true,
      render: (_, r) =>
        r.allBranches ? (
          <Tag className="cp-chip">{tForm("AllBranches")}</Tag>
        ) : (
          (r.branches ?? [])
            .map((b) => (locale === "ar" ? b.branch.arName : b.branch.enName))
            .join(listSep(locale))
        ),
    },
    {
      title: tTable("Status"),
      dataIndex: "isActive",
      key: "isActive",
      width: 130,
      align: "center",
      render: (active) => <StatusBadge active={active} tForm={tForm} />,
      ...statusFilter({ tForm }),
    },
    {
      title: (
        <Flex justify="center" align="center" gap="small">
          <span>{tTable("Actions")}</span>
          {canDelete && selectedRows.length > 0 && (
            <Popconfirm
              title={tAlerts("Confirm")}
              description={tAlerts("ConfirmDelete")}
              onConfirm={() => deleteParties(selectedRows)}
              okText={tButtons("Yes")}
              cancelText={tButtons("No")}
            >
              <Button
                color="danger"
                variant="outlined"
                size="small"
                icon={<DeleteOutlined />}
                loading={deleting}
              >
                {tButtons("Delete")} ({selectedRows.length})
              </Button>
            </Popconfirm>
          )}
        </Flex>
      ),
      key: "action",
      width: 150,
      align: "center",
      render: (_, record) => (
        <Space size="middle">
          {canEdit && (
            <Tag
              color={C.primary}
              style={{ padding: "6px 12px", fontSize: 14, cursor: "pointer" }}
              icon={<EditOutlined />}
              onClick={() => {
                setSelected(record);
                setEditModalOpen(true);
              }}
            >
              {tButtons("Edit")}
            </Tag>
          )}

          {canDelete && (
            <Popconfirm
              title={tAlerts("Confirm")}
              description={tAlerts("ConfirmDelete")}
              onConfirm={() => deleteParties([record.id])}
              okText={tButtons("Yes")}
              cancelText={tButtons("No")}
            >
              <Tag
                color={C.danger}
                variant="filled"
                style={{ padding: "6px 12px", fontSize: 14, cursor: "pointer" }}
                icon={<DeleteOutlined />}
              >
                {tButtons("Delete")}
              </Tag>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // مجموع عرض الأعمدة + عمود التحديد (checkbox)
  const TABLE_WIDTH = columns.reduce((sum, c) => sum + (c.width ?? 0), 50);

  return (
    <div>
      <Table
        bordered
        rowKey="id"
        columns={columns}
        dataSource={parties}
        loading={deleting}
        /* عرض ثابت لكل عمود حتى يتطابق الهيدر مع الصفوف (مهم مع scroll.y) */
        tableLayout="fixed"
        scroll={{ x: TABLE_WIDTH, y: 500 }}
        size="small"
        pagination={{
          current: page,
          pageSize,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        // التحديد متاح دائماً (للتصدير)، والحذف بصلاحيته
        rowSelection={{ selectedRowKeys: selectedRows, onChange: (keys) => setSelectedRows(keys) }}
      />

      <FormModal
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setSelected(null);
        }}
        width={900}
        title={
          <Flex align="center" gap="small">
            <Icon style={{ fontSize: 22 }} />
            <span>{tHeadings(config.editHeading)}</span>
          </Flex>
        }
        formId="EditPartyForm"
      >
        <PartyForm
          formId="EditPartyForm"
          party={selected}
          config={config}
          branches={branches}
        />
      </FormModal>
    </div>
  );
};

export default PartyTable;

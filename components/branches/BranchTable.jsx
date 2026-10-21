"use client";
import { useState } from "react";
import { Table, Space, Button, Tag, Popconfirm, Flex } from "antd";
import { message } from "@/components/common/feedback";
import { AiFillDelete, AiTwotoneEdit } from "react-icons/ai";
import { ShopOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useCan } from "@/components/auth/AuthProvider";
import FormModal from "@/components/common/FormModal";
import {
  textFilter,
  statusFilter,
  StatusBadge,
} from "@/components/common/tableFilters";
import { deleteBranchesAction } from "@/actions/branch.actions";
import EditBranchForm from "./EditBranchForm";
import "@/components/common/table.css";

// branches: الفروع من قاعدة البيانات
// بعد الحذف أو التعديل، الـ action يحدّث الصفحة فتصل branches الجديدة تلقائياً
const BranchTable = ({ branches = [], warehouses = [], priceLists = [] }) => {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const locale = useLocale();
  const tTable = useTranslations("Table");
  const tBranches = useTranslations("Branches");
  const tButtons = useTranslations("Buttons");
  const can = useCan();
  const canEdit = can("branches.update");
  const canDelete = can("branches.delete");
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");
  const tHeadings = useTranslations("Headings");

  const nameOf = (u) => (locale === "ar" ? u.arName : u.enName);

  // حذف فرع أو أكثر
  const deleteBranches = async (ids) => {
    setDeleting(true);
    const res = await deleteBranchesAction(ids);
    setDeleting(false);

    if (!res.success) {
      const names = res.details?.map(nameOf).join("، ");
      message.error(
        names ? `${tAlerts(res.error)}: ${names}` : tAlerts(res.error),
      );
      return;
    }

    message.success(tAlerts("BranchDeleted"));
    setSelectedRows([]);
  };

  const columns = [
    {
      title: tTable("ID"),
      dataIndex: "id",
      key: "id",
      width: 70,
      sorter: (a, b) => a.id - b.id,
    },
    {
      title: tTable("ArName"),
      dataIndex: "arName",
      key: "arName",
      align: "center",
      sorter: (a, b) => a.arName.localeCompare(b.arName),
      ...textFilter({
        getValue: (r) => r.arName,
        placeholder: tTable("ArName"),
        tButtons,
      }),
    },
    {
      title: tTable("EnName"),
      dataIndex: "enName",
      key: "enName",
      align: "center",
      sorter: (a, b) => a.enName.localeCompare(b.enName),
      ...textFilter({
        getValue: (r) => r.enName,
        placeholder: tTable("EnName"),
        tButtons,
      }),
    },
    {
      title: tTable("Address"),
      dataIndex: "address",
      key: "address",
      align: "center",
      ...textFilter({
        getValue: (r) => r.address,
        placeholder: tTable("Address"),
        tButtons,
      }),
    },
    {
      // مستودع الفرع (فاضي = المستودع الرئيسي)
      title: tBranches("Warehouse"),
      key: "warehouse",
      align: "center",
      render: (_, r) =>
        r.warehouse ? (
          <Tag color="cyan">
            {locale === "ar" ? r.warehouse.arName : r.warehouse.enName}
          </Tag>
        ) : (
          "—"
        ),
    },
    {
      title: tTable("Status"),
      dataIndex: "isActive",
      key: "isActive",
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
              onConfirm={() => deleteBranches(selectedRows)}
              okText={tButtons("Yes")}
              cancelText={tButtons("No")}
            >
              <Button
                color="danger"
                variant="outlined"
                size="small"
                icon={<AiFillDelete />}
                loading={deleting}
              >
                {tButtons("Delete")} ({selectedRows.length})
              </Button>
            </Popconfirm>
          )}
        </Flex>
      ),
      key: "action",
      align: "center",
      render: (_, record) => (
        <Space size="middle">
          {/* تعديل */}
          {canEdit && (
            <Tag
              color="#006266"
              style={{ padding: "6px 12px", fontSize: 14, cursor: "pointer" }}
              icon={<AiTwotoneEdit />}
              onClick={() => {
                setSelectedBranch(record);
                setEditModalOpen(true);
              }}
            >
              {tButtons("Edit")}
            </Tag>
          )}

          {/* حذف فرع واحدة */}
          {canDelete && (
            <Popconfirm
              title={tAlerts("Confirm")}
              description={tAlerts("ConfirmDelete")}
              onConfirm={() => deleteBranches([record.id])}
              okText={tButtons("Yes")}
              cancelText={tButtons("No")}
            >
              <Tag
                color="#EA2027"
                variant="filled"
                style={{ padding: "6px 12px", fontSize: 14, cursor: "pointer" }}
                icon={<AiFillDelete />}
              >
                {tButtons("Delete")}
              </Tag>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Table
        bordered
        rowKey="id"
        columns={columns}
        dataSource={branches}
        loading={deleting}
        scroll={{ x: "max-content", y: 400 }}
        size="small"
        pagination={{
          current: page,
          pageSize,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        rowSelection={
          canDelete
            ? {
                selectedRowKeys: selectedRows,
                onChange: (keys) => setSelectedRows(keys),
              }
            : undefined
        }
      />

      {/* نافذة التعديل */}
      <FormModal
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setSelectedBranch(null);
        }}
        title={
          <Flex align="center" gap="small">
            <ShopOutlined style={{ fontSize: 22 }} />
            <span>{tHeadings("EditBranchHeading")}</span>
          </Flex>
        }
        formId="EditBranchForm"
      >
        <EditBranchForm
          branch={selectedBranch}
          warehouses={warehouses}
          priceLists={priceLists}
        />
      </FormModal>
    </div>
  );
};

export default BranchTable;

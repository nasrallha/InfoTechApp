"use client";
import { useEffect, useState } from "react";
import { Table, Space, Button, Tag, Popconfirm, Flex } from "antd";
import { message } from "@/components/common/feedback";
import { AiFillDelete, AiTwotoneEdit } from "react-icons/ai";
import { BsUnity } from "react-icons/bs";
import { useLocale, useTranslations } from "next-intl";
import { useCan } from "@/components/auth/AuthProvider";
import FormModal from "@/components/common/FormModal";
import { textFilter, statusFilter, StatusBadge } from "@/components/common/tableFilters";
import { deleteUnitsAction } from "@/actions/unit.actions";
import EditUnitForm from "./EditUnitForm";
import "@/components/common/table.css";

// units: الوحدات من قاعدة البيانات
// بعد الحذف أو التعديل، الـ action يحدّث الصفحة فتصل units الجديدة تلقائياً
const UnitTable = ({ units = [], onSelectionChange }) => {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState(null);
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
  const canEdit = can("units.update");
  const canDelete = can("units.delete");
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");
  const tHeadings = useTranslations("Headings");

  const nameOf = (u) => (locale === "ar" ? u.arName : u.enName);

  // حذف وحدة أو أكثر
  const deleteUnits = async (ids) => {
    setDeleting(true);
    const res = await deleteUnitsAction(ids);
    setDeleting(false);

    if (!res.success) {
      const names = res.details?.map(nameOf).join("، ");
      message.error(names ? `${tAlerts(res.error)}: ${names}` : tAlerts(res.error));
      return;
    }

    message.success(tAlerts("UnitDeleted"));
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
      title: tTable("ArUnitName"),
      dataIndex: "arName",
      key: "arName",
      align: "center",
      sorter: (a, b) => a.arName.localeCompare(b.arName),
      ...textFilter({
        getValue: (r) => r.arName,
        placeholder: tTable("ArUnitName"),
        tButtons,
      }),
    },
    {
      title: tTable("EnUnitName"),
      dataIndex: "enName",
      key: "enName",
      align: "center",
      sorter: (a, b) => a.enName.localeCompare(b.enName),
      ...textFilter({
        getValue: (r) => r.enName,
        placeholder: tTable("EnUnitName"),
        tButtons,
      }),
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
              onConfirm={() => deleteUnits(selectedRows)}
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
                setSelectedUnit(record);
                setEditModalOpen(true);
              }}
            >
              {tButtons("Edit")}
            </Tag>
          )}

          {/* حذف وحدة واحدة */}
          {canDelete && (
            <Popconfirm
              title={tAlerts("Confirm")}
              description={tAlerts("ConfirmDelete")}
              onConfirm={() => deleteUnits([record.id])}
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
        dataSource={units}
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
        // التحديد متاح دائماً (للتصدير)، والحذف بصلاحيته
        rowSelection={{ selectedRowKeys: selectedRows, onChange: (keys) => setSelectedRows(keys) }}
      />

      {/* نافذة التعديل */}
      <FormModal
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setSelectedUnit(null);
        }}
        title={
          <Flex align="center" gap="small">
            <BsUnity style={{ fontSize: 22 }} />
            <span>{tHeadings("EditUnitHeading")}</span>
          </Flex>
        }
        formId="EditUnitForm"
      >
        <EditUnitForm unit={selectedUnit} />
      </FormModal>
    </div>
  );
};

export default UnitTable;

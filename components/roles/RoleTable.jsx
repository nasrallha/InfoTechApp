"use client";
import { useState } from "react";
import { Table, Space, Button, Tag, Popconfirm, Flex } from "antd";
import { message } from "@/components/common/feedback";
import {
  SafetyCertificateOutlined,
  CrownFilled,
  KeyOutlined,
  LockOutlined,
  DeleteOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import FormModal from "@/components/common/FormModal";
import {
  textFilter,
  statusFilter,
  StatusBadge,
} from "@/components/common/tableFilters";
import { deleteRolesAction } from "@/actions/role.actions";
import { useCan, useCurrentUser } from "@/components/auth/AuthProvider";
import { roleGroups, rolePermissionsCount } from "@/lib/permissions";
import EditRoleForm from "./EditRoleForm";
import RolePermissionsForm from "./RolePermissionsForm";
import { listSep } from "@/lib/list-sep";
import { C } from "@/lib/theme";
import "@/components/common/table.css";

// roles: الأدوار من قاعدة البيانات
// بعد الحذف أو التعديل، الـ action يحدّث الصفحة فتصل roles الجديدة تلقائياً
// customAllowed: الباقة بتسمح بتعديل الأدوار العادية
// الأدوار الثابتة (templateKey) مقفولة دايماً
// lockDelete: الأدوار الثابتة مبتتمسحش (وضع الشركات)
const RoleTable = ({
  roles = [],
  customAllowed = true,
  lockFixed = true,
  lockDelete = true,
}) => {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const locale = useLocale();
  const tTable = useTranslations("Table");
  const tButtons = useTranslations("Buttons");
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");
  const tHeadings = useTranslations("Headings");

  const tPermissions = useTranslations("Permissions");
  const can = useCan();
  const currentUser = useCurrentUser();
  const currentUserOwnerMode = Boolean(currentUser?.ownerMode);
  // صلاحيات وحدات النشاط المقفولة عند الشركة مبتظهرش
  const moduleHidden = currentUser?.moduleBlocked;
  // الصلاحيات اللي تتدي للأدوار (من غير صلاحيات مالك البرنامج)
  const assignable = new Set(
    roleGroups(currentUserOwnerMode, moduleHidden).flatMap((g) =>
      g.actions.map((a) => `${g.key}.${a}`),
    ),
  );

  const nameOf = (u) => (locale === "ar" ? u.arName : u.enName);

  const canEdit = can("roles.update");
  const canDelete = can("roles.delete");
  const canPermissions = can("roles.permissions");
  // الدور ده ينفع يتعدّل؟ (مدير النظام دايماً، الثابت أبداً، العادي حسب الباقة)
  const locked = (r) => Boolean(r.templateKey) && lockFixed;
  const editable = (r) => !locked(r) && customAllowed;
  const noDelete = (r) => locked(r) || (lockDelete && Boolean(r.templateKey));

  // حذف دور أو أكثر
  const deleteRoles = async (ids) => {
    setDeleting(true);
    const res = await deleteRolesAction(ids);
    setDeleting(false);

    if (!res.success) {
      const names = res.details?.map(nameOf).join(listSep(locale));
      message.error(
        names ? `${tAlerts(res.error)}: ${names}` : tAlerts(res.error),
      );
      return;
    }

    message.success(tAlerts("RoleDeleted"));
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
      width: 200,
      ellipsis: true,
      render: (v, r) => (
        <span>
          {r.isSuper && (
            <CrownFilled style={{ color: C.warning, marginInlineEnd: 6 }} />
          )}
          {v}
          {locked(r) && (
            <Tag
              icon={<LockOutlined />}
              color="default"
              style={{ marginInlineStart: 6 }}
            >
              {tTable("FixedRole")}
            </Tag>
          )}
          {/* الدور الثابت اتعدّل للشركة دي (اللوحة متكتبش فوقه) */}
          {r.templateKey && r.isCustomized && (
            <Tag color="orange" style={{ marginInlineStart: 6 }}>
              {tTable("CustomizedRole")}
            </Tag>
          )}
        </span>
      ),
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
      width: 200,
      ellipsis: true,
      sorter: (a, b) => a.enName.localeCompare(b.enName),
      ...textFilter({
        getValue: (r) => r.enName,
        placeholder: tTable("EnName"),
        tButtons,
      }),
    },
    {
      title: tTable("Permissions"),
      key: "permissions",
      align: "center",
      width: 170,
      render: (_, r) =>
        r.isSuper ? (
          <Tag color="gold" icon={<CrownFilled />}>
            {tPermissions("AllPermissions")}
          </Tag>
        ) : (
          <Tag color={r.permissions.length ? "blue" : "default"}>
            {r.permissions.filter((p) => assignable.has(p)).length} /{" "}
            {rolePermissionsCount(currentUserOwnerMode, moduleHidden)}
          </Tag>
        ),
    },
    {
      title: tTable("UsersCount"),
      dataIndex: "usersCount",
      key: "usersCount",
      align: "center",
      width: 130,
      sorter: (a, b) => a.usersCount - b.usersCount,
    },
    {
      title: tTable("Status"),
      dataIndex: "isActive",
      key: "isActive",
      align: "center",
      width: 130,
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
              onConfirm={() => deleteRoles(selectedRows)}
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
      align: "center",
      width: 320,
      render: (_, record) => (
        <Space size="middle">
          {!editable(record) && (
            <Tag icon={<LockOutlined />} style={{ padding: "6px 12px" }}>
              {tTable("FixedRole")}
            </Tag>
          )}
          {/* الصلاحيات */}
          {canPermissions && editable(record) && (
            <Tag
              color={C.header}
              style={{ padding: "6px 12px", fontSize: 14, cursor: "pointer" }}
              icon={<KeyOutlined />}
              onClick={() => {
                setSelectedRole(record);
                setPermissionsModalOpen(true);
              }}
            >
              {tButtons("Permissions")}
            </Tag>
          )}

          {/* تعديل */}
          {canEdit && editable(record) && (
            <Tag
              color={C.primary}
              style={{ padding: "6px 12px", fontSize: 14, cursor: "pointer" }}
              icon={<EditOutlined />}
              onClick={() => {
                setSelectedRole(record);
                setEditModalOpen(true);
              }}
            >
              {tButtons("Edit")}
            </Tag>
          )}

          {/* حذف دور واحد */}
          {canDelete && !noDelete(record) && customAllowed && (
            <Popconfirm
              title={tAlerts("Confirm")}
              description={tAlerts("ConfirmDelete")}
              onConfirm={() => deleteRoles([record.id])}
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
        dataSource={roles}
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
        rowSelection={
          canDelete && customAllowed
            ? {
                selectedRowKeys: selectedRows,
                onChange: (keys) => setSelectedRows(keys),
                getCheckboxProps: (r) => ({ disabled: noDelete(r) }),
              }
            : undefined
        }
      />

      {/* نافذة التعديل */}
      <FormModal
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setSelectedRole(null);
        }}
        title={
          <Flex align="center" gap="small">
            <SafetyCertificateOutlined style={{ fontSize: 22 }} />
            <span>{tHeadings("EditRoleHeading")}</span>
          </Flex>
        }
        formId="EditRoleForm"
      >
        <EditRoleForm role={selectedRole} />
      </FormModal>

      {/* نافذة صلاحيات الدور */}
      <FormModal
        open={permissionsModalOpen}
        onCancel={() => {
          setPermissionsModalOpen(false);
          setSelectedRole(null);
        }}
        width={900}
        title={
          <Flex align="center" justify="center" gap="small">
            <KeyOutlined style={{ fontSize: 20 }} />
            <span>
              {tHeadings("RolePermissionsHeading")}
              {selectedRole ? `: ${nameOf(selectedRole)}` : ""}
            </span>
          </Flex>
        }
        formId="RolePermissionsForm"
      >
        <RolePermissionsForm role={selectedRole} />
      </FormModal>
    </div>
  );
};

export default RoleTable;

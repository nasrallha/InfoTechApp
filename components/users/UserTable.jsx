"use client";
import { useEffect, useState } from "react";
import { Table, Space, Button, Tag, Popconfirm, Flex, Avatar } from "antd";
import { message } from "@/components/common/feedback";
import { CrownFilled, UserOutlined, DeleteOutlined, EditOutlined, KeyOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import FormModal from "@/components/common/FormModal";
import { textFilter, statusFilter, StatusBadge } from "@/components/common/tableFilters";
import { useCan, useCurrentUser } from "@/components/auth/AuthProvider";
import { deleteUsersAction, unlockUserAction } from "@/actions/user.actions";
import { LockOutlined, UnlockOutlined } from "@ant-design/icons";
import { imageUrl } from "@/lib/image";
import UserForm from "./UserForm";
import UserPermissionsForm from "./UserPermissionsForm";
import { C } from "@/lib/theme";
import "@/components/common/table.css";

// جدول المستخدمين
// users: من السيرفر (مدير النظام يرى الكل، غيره يرى مستخدمي فرعه فقط)
const UserTable = ({ users = [], roles, branches, onSelectionChange }) => {
  const [editModalOpen, setEditModalOpen] = useState(false);
  // صلاحيات المستخدم (استثناءات على دوره)
  const [permsUser, setPermsUser] = useState(null);
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
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");
  const tHeadings = useTranslations("Headings");
  const can = useCan();
  const currentUser = useCurrentUser();

  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);
  const fullNameOf = (u) => (locale === "ar" ? u.arFullname : u.enFullname);

  // تاريخ آخر دخول: 11 أكتوبر 2026، 7:30 م
  const formatDate = (d) =>
    d
      ? new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(d))
      : "-";

  const canEdit = can("users.update");
  // صلاحيات المستخدم: مش لنفسه، ومش لمدير النظام (له كل حاجة)
  const canPermissions = can("users.permissions");
  const customized = (u) =>
    (u.grantedPermissions?.length ?? 0) + (u.revokedPermissions?.length ?? 0) > 0;
  const canUnlock = can("loginSecurity.unlock");
  const [unlocking, setUnlocking] = useState(null);

  // فك قفل مستخدم اتقفل بسبب محاولات دخول غلط
  const unlock = async (record) => {
    setUnlocking(record.id);
    const res = await unlockUserAction(record.id);
    setUnlocking(null);
    if (!res.success) return message.error(tAlerts(res.error));
    message.success(tAlerts("UserUnlocked"));
  };
  const canDelete = can("users.delete");

  const deleteUsers = async (ids) => {
    setDeleting(true);
    const res = await deleteUsersAction(ids);
    setDeleting(false);

    if (!res.success) {
      message.error(tAlerts(res.error));
      return;
    }

    message.success(tAlerts("UserDeleted"));
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
      title: tTable("Name"),
      key: "name",
      width: 240,
      ellipsis: true,
      sorter: (a, b) => fullNameOf(a).localeCompare(fullNameOf(b)),
      render: (_, r) => (
        <Space>
          {/* صورة المستخدم لو موجودة، وإلا أول حرف من اسمه */}
          <Avatar size={32} src={imageUrl(r.image)} style={{ backgroundColor: C.primary }}>
            {fullNameOf(r)?.trim()?.charAt(0)?.toUpperCase()}
          </Avatar>
          <span className="font-bold">{fullNameOf(r)}</span>
          {r.id === currentUser?.id && <Tag color="cyan">{tTable("You")}</Tag>}
        </Space>
      ),
      ...textFilter({
        getValue: (r) => `${r.arFullname} ${r.enFullname}`,
        placeholder: tTable("Name"),
        tButtons,
      }),
    },
    {
      title: tTable("Username"),
      dataIndex: "username",
      key: "username",
      align: "center",
      width: 160,
      ellipsis: true,
      render: (v) => <span dir="ltr">{v}</span>,
      ...textFilter({ getValue: (r) => r.username, placeholder: tTable("Username"), tButtons }),
    },
    {
      title: tTable("Role"),
      key: "role",
      align: "center",
      width: 180,
      render: (_, r) =>
        r.role.isSuper ? (
          <Tag color="gold" icon={<CrownFilled />}>
            {nameOf(r.role)}
          </Tag>
        ) : (
          <>
            <Tag color="blue">{nameOf(r.role)}</Tag>
            {/* المستخدم له استثناءات على صلاحيات دوره */}
            {customized(r) && (
              <Tag color="orange">{tTable("CustomPermissions")}</Tag>
            )}
          </>
        ),
      filters: roles.map((role) => ({ text: nameOf(role), value: role.id })),
      onFilter: (value, r) => r.role.id === value,
    },
    {
      title: tTable("Branch"),
      key: "branch",
      align: "center",
      width: 170,
      ellipsis: true,
      render: (_, r) => nameOf(r.branch),
      filters: branches.map((b) => ({ text: nameOf(b), value: b.id })),
      onFilter: (value, r) => r.branch.id === value,
    },
    {
      title: tTable("LastLogin"),
      dataIndex: "lastLoginAt",
      key: "lastLoginAt",
      align: "center",
      width: 190,
      sorter: (a, b) => new Date(a.lastLoginAt ?? 0) - new Date(b.lastLoginAt ?? 0),
      render: formatDate,
    },
    {
      title: tTable("Status"),
      dataIndex: "isActive",
      key: "isActive",
      align: "center",
      width: 130,
      render: (active, r) => (
        <Space size={4} wrap style={{ justifyContent: "center" }}>
          <StatusBadge active={active} tForm={tForm} />
          {r.lockedUntil && (
            <Tag color="volcano" icon={<LockOutlined />}>
              {tTable("Locked")}
            </Tag>
          )}
        </Space>
      ),
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
              onConfirm={() => deleteUsers(selectedRows)}
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
      width: 280,
      render: (_, record) => (
        <Space size="middle">
          {canUnlock && record.lockedUntil && (
            <Popconfirm
              title={tAlerts("UnlockUserConfirm")}
              onConfirm={() => unlock(record)}
              okText={tButtons("Yes")}
              cancelText={tButtons("No")}
            >
              <Button
                size="small"
                type="primary"
                icon={<UnlockOutlined />}
                loading={unlocking === record.id}
              >
                {tTable("Unlock")}
              </Button>
            </Popconfirm>
          )}
          {canPermissions &&
            record.id !== currentUser?.id &&
            !record.role?.isSuper && (
              <Tag
                color={C.header}
                style={{ padding: "6px 12px", fontSize: 14, cursor: "pointer" }}
                icon={<KeyOutlined />}
                onClick={() => setPermsUser(record)}
              >
                {tButtons("Permissions")}
                {customized(record) && " *"}
              </Tag>
            )}
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

          {/* لا يحذف المستخدم نفسه */}
          {canDelete && record.id !== currentUser?.id && (
            <Popconfirm
              title={tAlerts("Confirm")}
              description={tAlerts("ConfirmDelete")}
              onConfirm={() => deleteUsers([record.id])}
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
        dataSource={users}
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
        rowSelection={{
                selectedRowKeys: selectedRows,
                onChange: (keys) => setSelectedRows(keys),
                // لا يقدر يحدد نفسه للحذف
                getCheckboxProps: (r) => ({
                  disabled: canDelete && r.id === currentUser?.id,
                }),
              }}
      />

      <FormModal
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setSelected(null);
        }}
        width={760}
        title={
          <Flex align="center" gap="small">
            <UserOutlined style={{ fontSize: 22 }} />
            <span>{tHeadings("EditUserHeading")}</span>
          </Flex>
        }
        formId="EditUserForm"
      >
        <UserForm formId="EditUserForm" user={selected} roles={roles} branches={branches} />
      </FormModal>

      {/* صلاحيات المستخدم: الدور قالب + استثناءاته */}
      <FormModal
        open={Boolean(permsUser)}
        onCancel={() => setPermsUser(null)}
        width={1150}
        title={
          <Flex align="center" gap="small">
            <KeyOutlined style={{ fontSize: 20 }} />
            <span>
              {tHeadings("UserPermissionsHeading")}
              {permsUser ? `: ${fullNameOf(permsUser)}` : ""}
            </span>
          </Flex>
        }
        formId="UserPermissionsForm"
      >
        <UserPermissionsForm key={permsUser?.id} user={permsUser} />
      </FormModal>
    </div>
  );
};

export default UserTable;

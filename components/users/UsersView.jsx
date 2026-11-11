"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { UserAddOutlined } from "@ant-design/icons";
import PageHeader from "@/components/common/PageHeader";
import { UsersExport } from "@/components/reports/ListExports";
import FormModal from "@/components/common/FormModal";
import { useCan } from "@/components/auth/AuthProvider";
import UserForm from "./UserForm";
import UserTable from "./UserTable";

// الجزء التفاعلي من صفحة المستخدمين
// users, roles, branches: من السيرفر (roles و branches لقوائم الاختيار في الفورم)
export default function UsersView({ users, roles, branches }) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  // المحدد في الجدول (للتصدير)
  const [selectedIds, setSelectedIds] = useState([]);
  const tSidebar = useTranslations("Sidebar");
  const tButtons = useTranslations("Buttons");
  const tHeadings = useTranslations("Headings");
  const can = useCan();

  return (
    <>
      <PageHeader
        extra={<UsersExport users={users} selectedIds={selectedIds} />}
        title={tSidebar("Users")}
        buttonTitle={can("users.create") ? tButtons("AddNewUser") : null}
        onButtonClick={() => setAddModalOpen(true)}
      />

      <FormModal
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        width={900}
        title={
          <>
            <UserAddOutlined style={{ fontSize: 22, marginInlineEnd: 6 }} />
            {tHeadings("AddUserHeading")}
          </>
        }
        formId="AddUserForm"
      >
        <UserForm formId="AddUserForm" roles={roles} branches={branches} />
      </FormModal>

      <UserTable
        users={users}
        roles={roles}
        branches={branches}
        onSelectionChange={setSelectedIds}
      />
    </>
  );
}

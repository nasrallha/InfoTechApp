"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useCan } from "@/components/auth/AuthProvider";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import PageHeader from "@/components/common/PageHeader";
import FormModal from "@/components/common/FormModal";
import AddRoleForm from "./AddRoleForm";
import RoleTable from "./RoleTable";

// الجزء التفاعلي من صفحة الأدوار
// roles: تصل من page.jsx (السيرفر) جاهزة، وتتحدث تلقائياً بعد أي عملية
export default function RolesView({ roles }) {
  const [addRoleModalOpen, setAddRoleModalOpen] = useState(false);
  const tSidebar = useTranslations("Sidebar");
  const tButtons = useTranslations("Buttons");
  const can = useCan();
  const tHeadings = useTranslations("Headings");

  return (
    <>
      <PageHeader
        title={tSidebar("Roles")}
        buttonTitle={can("roles.create") ? tButtons("AddNewRole") : null}
        onButtonClick={() => setAddRoleModalOpen(true)}
      />

      <FormModal
        open={addRoleModalOpen}
        onCancel={() => setAddRoleModalOpen(false)}
        title={
          <>
            <SafetyCertificateOutlined
              style={{
                display: "inline-block",
                fontSize: 25,
                margin: "5px 0",
                transform: "translateY(-3px)",
              }}
            />{" "}
            {tHeadings("AddRoleHeading")}
          </>
        }
        formId="AddRoleForm"
      >
        <AddRoleForm />
      </FormModal>

      <RoleTable roles={roles} />
    </>
  );
}

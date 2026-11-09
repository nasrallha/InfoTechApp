"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "antd";
import { useCan } from "@/components/auth/AuthProvider";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import PageHeader from "@/components/common/PageHeader";
import FormModal from "@/components/common/FormModal";
import AddRoleForm from "./AddRoleForm";
import RoleTable from "./RoleTable";

// الجزء التفاعلي من صفحة الأدوار
// roles: تصل من page.jsx (السيرفر) جاهزة، وتتحدث تلقائياً بعد أي عملية
// customAllowed: الباقة بتسمح للمدير يعمل أدوار بنفسه (غير الأدوار الثابتة)
// lockFixed: الأدوار الثابتة مقفولة (وضع الشركات)
export default function RolesView({
  roles,
  customAllowed = true,
  lockFixed = true,
  lockDelete = true,
}) {
  const [addRoleModalOpen, setAddRoleModalOpen] = useState(false);
  const tSidebar = useTranslations("Sidebar");
  const tButtons = useTranslations("Buttons");
  const can = useCan();
  const tHeadings = useTranslations("Headings");
  const tAlerts = useTranslations("Alerts");

  return (
    <>
      <PageHeader
        title={tSidebar("Roles")}
        buttonTitle={
          can("roles.create") && customAllowed ? tButtons("AddNewRole") : null
        }
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

      {!customAllowed && (
        <Alert
          type="info"
          showIcon
          className="mb-4"
          title={tAlerts("CustomRolesNotInPlan")}
        />
      )}
      <RoleTable
        roles={roles}
        customAllowed={customAllowed}
        lockFixed={lockFixed}
        lockDelete={lockDelete}
      />
    </>
  );
}

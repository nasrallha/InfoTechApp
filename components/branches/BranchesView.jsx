"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useCan } from "@/components/auth/AuthProvider";
import { ShopOutlined } from "@ant-design/icons";
import PageHeader from "@/components/common/PageHeader";
import FormModal from "@/components/common/FormModal";
import AddBranchForm from "./AddBranchForm";
import BranchTable from "./BranchTable";

// الجزء التفاعلي من صفحة الفروع
// branches: تصل من page.jsx (السيرفر) جاهزة، وتتحدث تلقائياً بعد أي عملية
export default function BranchesView({ branches, warehouses, priceLists }) {
  const [addBranchModalOpen, setAddBranchModalOpen] = useState(false);
  const tSidebar = useTranslations("Sidebar");
  const tButtons = useTranslations("Buttons");
  const can = useCan();
  const tHeadings = useTranslations("Headings");

  return (
    <>
      <PageHeader
        title={tSidebar("Branches")}
        buttonTitle={can("branches.create") ? tButtons("AddNewBranch") : null}
        onButtonClick={() => setAddBranchModalOpen(true)}
      />

      <FormModal
        open={addBranchModalOpen}
        onCancel={() => setAddBranchModalOpen(false)}
        title={
          <>
            <ShopOutlined
              style={{
                display: "inline-block",
                fontSize: 25,
                margin: "5px 0",
                transform: "translateY(-3px)",
              }}
            />{" "}
            {tHeadings("AddBranchHeading")}
          </>
        }
        formId="AddBranchForm"
      >
        <AddBranchForm warehouses={warehouses} priceLists={priceLists} />
      </FormModal>

      <BranchTable
        branches={branches}
        warehouses={warehouses}
        priceLists={priceLists}
      />
    </>
  );
}

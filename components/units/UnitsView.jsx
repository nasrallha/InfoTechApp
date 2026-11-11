"use client";
import { ColumnWidthOutlined } from "@ant-design/icons";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useCan } from "@/components/auth/AuthProvider";
import PageHeader from "@/components/common/PageHeader";
import FormModal from "@/components/common/FormModal";
import { UnitsExport } from "@/components/reports/ListExports";
import ImportButton from "@/components/import/ImportButton";
import AddUnitForm from "./AddUnitForm";
import UnitTable from "./UnitTable";

// الجزء التفاعلي من صفحة الوحدات
// units: تصل من page.jsx (السيرفر) جاهزة، وتتحدث تلقائياً بعد أي عملية
export default function UnitsView({ units }) {
  const [addUnitModalOpen, setAddUnitModalOpen] = useState(false);
  // المحدد في الجدول (للتصدير)
  const [selectedIds, setSelectedIds] = useState([]);
  const tSidebar = useTranslations("Sidebar");
  const tButtons = useTranslations("Buttons");
  const can = useCan();
  const tHeadings = useTranslations("Headings");

  return (
    <>
      <PageHeader
        extra={
          <div className="flex flex-wrap gap-2">
            <ImportButton kind="units" />
            <UnitsExport units={units} selectedIds={selectedIds} />
          </div>
        }
        title={tSidebar("Units")}
        buttonTitle={can("units.create") ? tButtons("AddNewUnit") : null}
        onButtonClick={() => setAddUnitModalOpen(true)}
      />

      <FormModal
        open={addUnitModalOpen}
        onCancel={() => setAddUnitModalOpen(false)}
        title={
          <>
            <ColumnWidthOutlined
              style={{
                display: "inline-block",
                fontSize: 25,
                margin: "5px 0",
                transform: "translateY(-3px)",
              }}
            />{" "}
            {tHeadings("AddUnitHeading")}
          </>
        }
        formId="AddUnitForm"
      >
        <AddUnitForm />
      </FormModal>

      <UnitTable units={units} onSelectionChange={setSelectedIds} />
    </>
  );
}

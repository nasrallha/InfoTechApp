"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useCan } from "@/components/auth/AuthProvider";
import { MdCategory } from "react-icons/md";
import PageHeader from "@/components/common/PageHeader";
import FormModal from "@/components/common/FormModal";
import { CategoriesExport } from "@/components/reports/ListExports";
import AddCategoryForm from "./AddCategoryForm";
import CategoriesTree from "./CategoriesTree";

// الجزء التفاعلي من صفحة الأقسام (أزرار ونوافذ وstate)
// categories: تصل من page.jsx (السيرفر) جاهزة
// بعد أي إضافة أو تعديل أو حذف، الـ action يحدّث الصفحة،
// فتصل categories الجديدة هنا تلقائياً
export default function CategoriesView({ categories }) {
  const [addCategoryModalOpen, setAddCategoryModalOpen] = useState(false);
  // المحدد في الشجرة (للتصدير)
  const [selectedIds, setSelectedIds] = useState([]);

  const tSidebar = useTranslations("Sidebar");
  const tButtons = useTranslations("Buttons");
  const can = useCan();
  const tHeadings = useTranslations("Headings");

  return (
    <>
      <PageHeader
        extra={
          <CategoriesExport categories={categories} selectedIds={selectedIds} />
        }
        title={tSidebar("Categories")}
        buttonTitle={can("categories.create") ? tButtons("AddNewCategory") : null}
        onButtonClick={() => setAddCategoryModalOpen(true)}
      />

      <CategoriesTree
        categories={categories}
        onSelectionChange={setSelectedIds}
      />

      <FormModal
        open={addCategoryModalOpen}
        onCancel={() => setAddCategoryModalOpen(false)}
        title={
          <>
            <MdCategory
              style={{
                display: "inline-block",
                fontSize: 25,
                margin: "5px 0",
                transform: "translateY(-3px)",
              }}
            />{" "}
            {tHeadings("AddCategoryHeading")}
          </>
        }
        formId="AddCategoryForm"
      >
        {/* الأقسام الرئيسية = المستوى الأول من الشجرة */}
        <AddCategoryForm mainCategories={categories} />
      </FormModal>
    </>
  );
}

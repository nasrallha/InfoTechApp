"use client";

import { useState } from "react";
import { Button, Tooltip } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { useCan } from "@/components/auth/AuthProvider";
import FormModal from "@/components/common/FormModal";
import AddCategoryForm from "@/components/categories/AddCategoryForm";
import AddUnitForm from "@/components/units/AddUnitForm";

// ============================================================
// إضافة سريعة لقسم أو وحدة من شاشة الصنف (زي العميل والمورد في الفواتير)
// بيفتح نفس فورم القسم/الوحدة، وبعد الحفظ بيرجّع الجديد (onCreated)
// عشان الشاشة تختاره على طول
// kind: "category" | "unit"، mainCategories: الأقسام الرئيسية (للقسم الأب)
// يظهر بس لو المستخدم عنده صلاحية الإضافة
// ============================================================
const CONFIG = {
  category: {
    permission: "categories.create",
    title: "AddCategoryHeading",
    button: "AddNewCategory",
    formId: "AddCategoryForm",
  },
  unit: {
    permission: "units.create",
    title: "AddUnitHeading",
    button: "AddNewUnit",
    formId: "AddUnitForm",
  },
};

export default function QuickAddLookup({
  kind,
  onCreated,
  mainCategories = [],
}) {
  const [open, setOpen] = useState(false);
  const can = useCan();
  const tButtons = useTranslations("Buttons");
  const tHeadings = useTranslations("Headings");
  const c = CONFIG[kind];
  if (!can(c.permission)) return null;

  return (
    <>
      <Tooltip title={tButtons(c.button)}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          aria-label={tButtons(c.button)}
          onClick={() => setOpen(true)}
        />
      </Tooltip>
      <FormModal
        open={open}
        formId={c.formId}
        title={tHeadings(c.title)}
        onCancel={(created) => {
          setOpen(false);
          if (created?.id) onCreated?.(created);
        }}
      >
        {kind === "category" ? (
          <AddCategoryForm mainCategories={mainCategories} />
        ) : (
          <AddUnitForm />
        )}
      </FormModal>
    </>
  );
}

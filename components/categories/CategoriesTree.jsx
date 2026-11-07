"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Flex,
  Tree,
  Button,
  Popconfirm,
  Space,
  Tooltip,
  Tag,
  Spin,
  Empty,
  Avatar,
} from "antd";
import { message } from "@/components/common/feedback";
import { EditOutlined, DeleteOutlined, PictureOutlined, AppstoreOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useCan } from "@/components/auth/AuthProvider";
import FormModal from "@/components/common/FormModal";
import EditCategoryForm from "./EditCategoryForm";
import { deleteCategoriesAction } from "@/actions/category.actions";
import { imageUrl } from "@/lib/image";
import { listSep } from "@/lib/list-sep";
import { C } from "@/lib/theme";

// categories: الأقسام من قاعدة البيانات (رئيسية ومع كل واحد children)
// بعد الحذف أو التعديل، الـ action يحدّث الصفحة فتصل categories الجديدة تلقائياً
const CategoriesTree = ({ categories = [], onSelectionChange }) => {
  const [checkedKeys, setCheckedKeys] = useState([]);
  // التحديد يُستخدم كمان في التصدير (Excel / طباعة / PDF): المحدد فقط أو الكل
  useEffect(() => {
    onSelectionChange?.(checkedKeys);
  }, [checkedKeys, onSelectionChange]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [editCategoryModalOpen, setEditCategoryModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const locale = useLocale();
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const can = useCan();
  const canEdit = can("categories.update");
  const canDelete = can("categories.delete");
  const tHeadings = useTranslations("Headings");
  const tForm = useTranslations("Form");

  const nameOf = (c) => (locale === "ar" ? c.arName : c.enName);

  // تحويل بيانات قاعدة البيانات للشكل الذي يفهمه Tree في antd
  // key = رقم القسم، و category = بيانات القسم كاملة (نحتاجها في التعديل)
const treeData = useMemo(() => {
  const nameOf = (c) => (locale === "ar" ? c.arName : c.enName);

  return categories.map((c) => ({
    key: c.id,
    title: nameOf(c),
    category: c,
    children: c.children.map((child) => ({
      key: child.id,
      title: nameOf(child),
      category: child,
    })),
  }));
}, [categories, locale]);

  // حذف قسم أو أكثر
  const deleteCategories = async (ids) => {
    setDeleting(true);
    const res = await deleteCategoriesAction(ids);
    setDeleting(false);

    if (!res.success) {
      // لو الحذف مرفوض نعرض أسماء الأقسام المستخدمة
      const names = res.details?.map(nameOf).join(listSep(locale));
      message.error(names ? `${tAlerts(res.error)}: ${names}` : tAlerts(res.error));
      return;
    }

    message.success(tAlerts("CategoryDeleted"));
    setCheckedKeys([]);
  };

  const handleEdit = (category) => {
    setSelectedCategory(category);
    setEditCategoryModalOpen(true);
  };

  // شكل كل عنصر في الشجرة (الاسم + أزرار التعديل والحذف)
  const renderTreeTitle = (node) => {
    const category = node.category;

    return (
      <Flex
        justify="space-between"
        align="center"
        style={{ width: "100%", paddingLeft: 8 }}
      >
        <span
          className={`mb-5 ${node.children?.length > 0 ? "text-base" : "text-sm"}`}
        >
          {/* صورة القسم (أو أيقونة لو لا توجد صورة) */}
          <Avatar
            shape="square"
            size={32}
            src={imageUrl(category.image)}
            icon={<PictureOutlined />}
            style={{ marginInlineEnd: 8 }}
          />
          {node.title}
          {!category.isActive && (
            <Tag color="default" style={{ marginInlineStart: 8 }}>
              {tForm("NotActive")}
            </Tag>
          )}
        </span>

        <Space size="large" onClick={(e) => e.stopPropagation()}>
          {canEdit && (
            <Tooltip title={`${tButtons("Edit")} ${node.title}`} color={C.accent}>
              <Tag
                color={C.primary}
                variant="filled"
                style={{ padding: "8px 15px", fontSize: 15, cursor: "pointer" }}
                icon={<EditOutlined />}
                onClick={() => handleEdit(category)}
              >
                {tButtons("Edit")}
              </Tag>
            </Tooltip>
          )}

          {canDelete && (
            <Popconfirm
              title={tAlerts("Confirm")}
              description={tAlerts("ConfirmDelete")}
              onConfirm={() => deleteCategories([category.id])}
              okText={tButtons("Yes")}
              cancelText={tButtons("No")}
            >
              <Tooltip title={`${tButtons("Delete")} ${node.title}`} color={C.danger}>
                <Tag
                  color={C.danger}
                  variant="filled"
                  style={{ padding: "8px 15px", fontSize: 15, cursor: "pointer" }}
                  icon={<DeleteOutlined />}
                >
                  {tButtons("Delete")}
                </Tag>
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      </Flex>
    );
  };

  return (
    <>
      <Flex vertical gap="medium" style={{ maxWidth: 600, margin: "0 auto" }}>
        <Flex justify="space-between">
          {canDelete && checkedKeys.length > 0 && (
            <Popconfirm
              title={tAlerts("Confirm")}
              description={tAlerts("ConfirmDelete")}
              onConfirm={() => deleteCategories(checkedKeys)}
              okText={tButtons("Yes")}
              cancelText={tButtons("No")}
            >
              <Button
                color="danger"
                variant="solid"
                icon={<DeleteOutlined />}
                loading={deleting}
              >
                {tButtons("Delete")} ({checkedKeys.length})
              </Button>
            </Popconfirm>
          )}
        </Flex>

        <Spin spinning={deleting}>
          {treeData.length === 0 ? (
            <Empty />
          ) : (
            <Tree
              checkable
              // checkStrictly: كل قسم يُختار لوحده
              // (بدونها اختيار كل الأقسام الفرعية يختار الأب تلقائياً فيُحذف معها)
              checkStrictly
              blockNode
              defaultExpandAll
              treeData={treeData}
              checkedKeys={checkedKeys}
              titleRender={renderTreeTitle}
              onCheck={(keys) => setCheckedKeys(keys.checked)}
              className="font-bold"
              style={{
                border: `1px solid ${C.border}`,
                padding: 12,
                borderRadius: 8,
                background: "#fff",
              }}
            />
          )}
        </Spin>
      </Flex>

      <FormModal
        open={editCategoryModalOpen}
        onCancel={() => setEditCategoryModalOpen(false)}
        title={
          <>
            <AppstoreOutlined
              style={{
                display: "inline-block",
                fontSize: 25,
                margin: "5px 0",
                transform: "translateY(-3px)",
              }}
            />{" "}
            {tHeadings("EditCategoryHeading")}
          </>
        }
        formId="EditCategoryForm"
      >
        <EditCategoryForm
          category={selectedCategory}
          mainCategories={categories}
        />
      </FormModal>
    </>
  );
};

export default CategoriesTree;

"use server";

// البوابة بين واجهة المنتجات والسيرفر
// الإضافة والتعديل يستقبلان FormData (لأن فيها صورة)

import { runAction } from "@/lib/action";
import {
  createProductSchema,
  updateProductSchema,
  deleteProductsSchema,
} from "@/validations/product.schema";
import {
  createProduct,
  updateProduct,
  deleteProducts,
  getProductDetails,
} from "@/services/product.service";
import { idField } from "@/validations/common.schema";

// كل قيم FormData نصوص، فنرجّع كل حقل لنوعه الصحيح قبل التحقق
function readProductForm(formData) {
  const num = (key) => {
    const v = formData.get(key);
    return v === null || v === "" ? undefined : Number(v);
  };
  const bool = (key) => formData.get(key) === "true";
  const image = formData.get("image");

  // الوحدات الإضافية تُرسل كنص JSON (لأنها قائمة كائنات)
  let units = [];
  try {
    units = JSON.parse(formData.get("units") || "[]");
  } catch {
    units = null; // سيرفضها Zod برسالة واضحة
  }

  return {
    ...(formData.get("id") ? { id: num("id") } : {}),
    code: formData.get("code") ?? "",
    arName: formData.get("arName") ?? "",
    enName: formData.get("enName") ?? "",
    categoryId: num("categoryId"),
    baseUnitId: num("baseUnitId"),
    cost: num("cost"),
    price: num("price"),
    wholesalePrice: num("wholesalePrice"),
    taxRate: num("taxRate"),
    isPriceIncludeTax: bool("isPriceIncludeTax"),
    taxCategory: formData.get("taxCategory") || "S",
    taxExemptionCode: formData.get("taxExemptionCode") || null,
    taxExemptionReason: formData.get("taxExemptionReason") || null,
    startStock: num("startStock"),
    isActive: bool("isActive"),
    image: image instanceof File && image.size > 0 ? image : null,
    removeImage: bool("removeImage"),
    units,
  };
}

export async function createProductAction(formData) {
  return runAction(
    createProductSchema,
    readProductForm(formData),
    (data) => createProduct(data),
    {
      permission: "products.create",
    },
  );
}

export async function updateProductAction(formData) {
  return runAction(
    updateProductSchema,
    readProductForm(formData),
    (data) => updateProduct(data),
    {
      permission: "products.update",
    },
  );
}

// الحذف من صفحة الجدول: نحدّث الصفحة بعد النجاح
export async function deleteProductsAction(ids) {
  return runAction(deleteProductsSchema, ids, (data) => deleteProducts(data), {
    permission: "products.delete",
    refresh: true,
  });
}

// كارت الصنف (نافذة عرض الصنف بالتفصيل)
export async function getProductDetailsAction(id) {
  return runAction(idField, id, (d, user) => getProductDetails(d, user), {
    permission: "products.view",
  });
}

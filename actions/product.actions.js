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
  nextProductCode,
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
  // المستودعات (الفروع): متاح فين + الرصيد الافتتاحي في كل مستودع
  // (الشاشة مبعتتش الجدول ← undefined: الإتاحة والأرصدة متتلمسش)
  let stores;
  try {
    const raw = formData.get("stores");
    stores = raw === null ? undefined : JSON.parse(raw || "[]");
  } catch {
    stores = null;
  }
  const allWarehouses = formData.get("allWarehouses");

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
    isService: bool("isService"),
    // تتبع الصلاحية (الميزة مقفولة: السيرفر بيتجاهلها)
    trackExpiry: bool("trackExpiry"),
    expiryAlertDays: formData.get("expiryAlertDays")
      ? num("expiryAlertDays")
      : null,
    image: image instanceof File && image.size > 0 ? image : null,
    removeImage: bool("removeImage"),
    units,
    ...(allWarehouses === null
      ? {}
      : { allWarehouses: allWarehouses === "true" }),
    stores,
    // الأرقام التسلسلية والضمان (وحدة serials)
    serialCount: num("serialCount"),
    serialLabel1: formData.get("serialLabel1") || null,
    serialLabel2: formData.get("serialLabel2") || null,
    warrantyMonths: num("warrantyMonths"),
    warrantyType: formData.get("warrantyType") || null,
    // المتابعة الدورية (وحدة followUps)
    followUpDays: num("followUpDays"),
    // التغيير الدوري للسيارات (وحدة vehicles)
    changeKm: num("changeKm"),
    changeMonths: num("changeMonths"),
    // مدة الخدمة (الحجوزات)
    durationMin: num("durationMin"),
  };
}

export async function createProductAction(formData) {
  return runAction(
    createProductSchema,
    readProductForm(formData),
    (data, user) => createProduct(data, user),
    {
      permission: "products.create",
    },
  );
}

export async function updateProductAction(formData) {
  return runAction(
    updateProductSchema,
    readProductForm(formData),
    (data, user) => updateProduct(data, user),
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

// الكود التلقائي الجاي (بيظهر في خانة الكود لو فاضية)
export async function nextProductCodeAction() {
  return runAction(null, null, () => nextProductCode(), {
    permission: "products.create",
  });
}

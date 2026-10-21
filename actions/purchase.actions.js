"use server";

// البوابة بين شاشات المشتريات والسيرفر

import { runAction } from "@/lib/action";
import {
  createPurchaseSchema,
  updatePurchaseSchema,
  createPurchaseReturnSchema,
  findPurchaseSchema,
  productSearchSchema,
  productBrowseSchema,
} from "@/validations/purchase.schema";
import { idField } from "@/validations/common.schema";
import {
  createPurchase,
  updatePurchase,
  deletePurchase,
  deletePurchaseReturn,
  createPurchaseReturn,
  findPurchasesForReturn,
  getPurchaseForReturn,
  searchPurchaseProducts,
  browsePurchaseProducts,
} from "@/services/purchase.service";

// فاتورة شراء جديدة
export async function createPurchaseAction(input) {
  return runAction(
    createPurchaseSchema,
    input,
    (d, user) => createPurchase(d, user),
    {
      permission: "purchases.create",
    },
  );
}

// بحث الأصناف (بالاسم أو الكود أو الماسح)
export async function searchPurchaseProductsAction(query) {
  return runAction(
    productSearchSchema,
    query,
    (q) => searchPurchaseProducts(q),
    {
      permission: "purchases.create",
    },
  );
}

// مرتجع مشتريات جديد
export async function createPurchaseReturnAction(input) {
  return runAction(
    createPurchaseReturnSchema,
    input,
    (d, user) => createPurchaseReturn(d, user),
    { permission: "purchaseReturns.create" },
  );
}

// البحث عن فاتورة الشراء المراد الإرجاع منها
export async function findPurchasesForReturnAction(input) {
  return runAction(
    findPurchaseSchema,
    input,
    (d, user) => findPurchasesForReturn(d, user),
    {
      permission: "purchaseReturns.create",
    },
  );
}

// فاتورة الشراء بأصنافها والمتاح للإرجاع من كل صنف
export async function getPurchaseForReturnAction(id) {
  return runAction(idField, id, (d, user) => getPurchaseForReturn(d, user), {
    permission: "purchaseReturns.create",
  });
}

// تصفح الأصناف (نافذة الاختيار: بحث + قسم + صفحات)
export async function browsePurchaseProductsAction(input) {
  return runAction(
    productBrowseSchema,
    input,
    (d) => browsePurchaseProducts(d),
    { permission: "purchases.create" },
  );
}

// تعديل فاتورة شراء (ممنوع لو عليها مرتجعات)
export async function updatePurchaseAction(input) {
  return runAction(
    updatePurchaseSchema,
    input,
    (d, user) => updatePurchase(d, user),
    { permission: "purchases.update" },
  );
}

// حذف فاتورة شراء (ممنوع لو عليها مرتجعات)
export async function deletePurchaseAction(id) {
  return runAction(idField, id, (d, user) => deletePurchase(d, user), {
    permission: "purchases.delete",
  });
}

// حذف مرتجع مشتريات (الكميات ترجع متاحة في فاتورة الشراء)
export async function deletePurchaseReturnAction(id) {
  return runAction(idField, id, (d, user) => deletePurchaseReturn(d, user), {
    permission: "purchaseReturns.delete",
  });
}

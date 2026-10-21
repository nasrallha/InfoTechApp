"use server";

// البوابة بين شاشات المبيعات (الكاشير، الفاتورة، المرتجع) والسيرفر

import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { idField } from "@/validations/common.schema";
import {
  createSaleSchema,
  updateSaleSchema,
  createSaleReturnSchema,
  findSaleSchema,
  saleSearchSchema,
  saleBrowseSchema,
} from "@/validations/sale.schema";
import {
  createSale,
  updateSale,
  deleteSale,
  createSaleReturn,
  deleteSaleReturn,
  findSalesForReturn,
  getSaleForReturn,
  getSale,
} from "@/services/sale.service";
import {
  searchSaleProducts,
  browseSaleProducts,
} from "@/services/sale-catalog.service";
import { afterSaleSaved } from "@/services/zatca-invoice.service";

// بعد الحفظ: الفاتورة الإلكترونية (توقيع + إرسال) لو الفرع مربوط بالزكاة
// zatcaSend: اختيار المستخدم "إرسال فوري" (فاضي = حسب الإعدادات)
async function withZatca(created, input, options = {}) {
  const send =
    typeof input?.zatcaSend === "boolean" ? input.zatcaSend : undefined;
  const zatca = await afterSaleSaved(created.id, { send, ...options });
  return { ...created, zatca };
}

// صلاحية أي شاشة بيع (الكاشير أو الفاتورة أو عرض السعر)
const assertSeller = (user) => {
  if (
    !can(user, "sales.create") &&
    !can(user, "sales.pos") &&
    !can(user, "quotations.create") &&
    !can(user, "quotations.update")
  ) {
    throw new AppError("Forbidden");
  }
};

// فاتورة بيع جديدة (الكاشير أو الفاتورة العادية)
export async function createSaleAction(input) {
  return runAction(createSaleSchema, input, async (d, user) => {
    const allowed =
      d.source === "pos" ? can(user, "sales.pos") : can(user, "sales.create");
    if (!allowed) throw new AppError("Forbidden");
    const created = await createSale(d, user);
    // الكاشير: منستناش رد الهيئة (الإرسال في الخلفية)
    return withZatca(created, input, { background: d.source === "pos" });
  });
}

export async function updateSaleAction(input) {
  return runAction(
    updateSaleSchema,
    input,
    async (d, user) => withZatca(await updateSale(d, user), input),
    { permission: "sales.update" },
  );
}

export async function deleteSaleAction(id) {
  return runAction(idField, id, (d, user) => deleteSale(d, user), {
    permission: "sales.delete",
  });
}

// الفاتورة كاملة (للطباعة من الكاشير بعد الحفظ)
export async function getSaleAction(id) {
  return runAction(idField, id, (d, user) => getSale(d, null, user), {
    permission: "sales.view",
  });
}

// ------------------------------------------------------------
// المرتجع
// ------------------------------------------------------------
export async function createSaleReturnAction(input) {
  return runAction(
    createSaleReturnSchema,
    input,
    async (d, user) => withZatca(await createSaleReturn(d, user), input),
    { permission: "salesReturns.create" },
  );
}

export async function deleteSaleReturnAction(id) {
  return runAction(idField, id, (d, user) => deleteSaleReturn(d, user), {
    permission: "salesReturns.delete",
  });
}

export async function findSalesForReturnAction(input) {
  return runAction(
    findSaleSchema,
    input,
    (d, user) => findSalesForReturn(d, user),
    { permission: "salesReturns.create" },
  );
}

export async function getSaleForReturnAction(id) {
  return runAction(idField, id, (d, user) => getSaleForReturn(d, user), {
    permission: "salesReturns.create",
  });
}

// ------------------------------------------------------------
// الأصناف (بأسعار البيع ورصيد الفرع)
// ------------------------------------------------------------
export async function searchSaleProductsAction(query) {
  return runAction(saleSearchSchema, query, (q, user) => {
    assertSeller(user);
    return searchSaleProducts(q, user);
  });
}

export async function browseSaleProductsAction(input) {
  return runAction(saleBrowseSchema, input, (d, user) => {
    assertSeller(user);
    return browseSaleProducts(d, user);
  });
}
